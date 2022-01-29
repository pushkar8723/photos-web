import { getEndpoint } from 'utils/common/apiUtil';
import localForage from 'utils/storage/localForage';
import { Collection } from 'types/collection';
import HTTPService from './HTTPService';
import { logError } from 'utils/sentry';
import { decryptFile, mergeMetadata, sortFiles } from 'utils/file';
import { EnteFile } from 'types/file';
import {
    AbuseReportDetails,
    AbuseReportRequest,
    LocalSavedPublicCollectionFiles,
} from 'types/publicCollection';
import CryptoWorker from 'utils/crypto';
import { REPORT_REASON } from 'constants/publicCollection';
import { CustomError, ServerErrorCodes } from 'utils/error';

const ENDPOINT = getEndpoint();
const PUBLIC_COLLECTION_FILES_TABLE = 'public-collection-files';
const PUBLIC_COLLECTIONS_TABLE = 'public-collections';

const getCollectionUID = (collection: Collection) => `${collection.key}`;
const getCollectionSyncTimeUID = (collectionUID: string) =>
    `public-${collectionUID}-time`;

export const getLocalPublicFiles = async (collection: Collection) => {
    const localSavedPublicCollectionFiles =
        (
            (await localForage.getItem<LocalSavedPublicCollectionFiles[]>(
                PUBLIC_COLLECTION_FILES_TABLE
            )) || []
        ).find(
            (localSavedPublicCollectionFiles) =>
                localSavedPublicCollectionFiles.collectionUID ===
                getCollectionUID(collection)
        ) ||
        ({
            collectionUID: null,
            files: [] as EnteFile[],
        } as LocalSavedPublicCollectionFiles);
    return localSavedPublicCollectionFiles.files;
};
export const savePublicCollectionFiles = async (
    collectionUID: string,
    files: EnteFile[]
) => {
    const publicCollectionFiles =
        (await localForage.getItem<LocalSavedPublicCollectionFiles[]>(
            PUBLIC_COLLECTION_FILES_TABLE
        )) || [];
    await localForage.setItem(
        PUBLIC_COLLECTION_FILES_TABLE,
        dedupeCollectionFiles([
            { collectionUID, files },
            ...publicCollectionFiles,
        ])
    );
};

export const getLocalPublicCollection = async (collectionKey: string) => {
    const localCollections =
        (await localForage.getItem<Collection[]>(PUBLIC_COLLECTIONS_TABLE)) ||
        [];
    const publicCollection =
        localCollections.find(
            (localSavedPublicCollection) =>
                localSavedPublicCollection.key === collectionKey
        ) || null;
    return publicCollection;
};

export const savePublicCollection = async (collection: Collection) => {
    const publicCollections =
        (await localForage.getItem<Collection[]>(PUBLIC_COLLECTIONS_TABLE)) ??
        [];
    await localForage.setItem(
        PUBLIC_COLLECTIONS_TABLE,
        dedupeCollections([collection, ...publicCollections])
    );
};

const dedupeCollections = (collections: Collection[]) => {
    const keySet = new Set([]);
    return collections.filter((collection) => {
        if (!keySet.has(collection.key)) {
            keySet.add(collection.key);
            return true;
        } else {
            return false;
        }
    });
};

const dedupeCollectionFiles = (
    collectionFiles: LocalSavedPublicCollectionFiles[]
) => {
    const keySet = new Set([]);
    return collectionFiles.filter(({ collectionUID }) => {
        if (!keySet.has(collectionUID)) {
            keySet.add(collectionUID);
            return true;
        } else {
            return false;
        }
    });
};

const getPublicCollectionLastSyncTime = async (collectionUID: string) =>
    (await localForage.getItem<number>(
        getCollectionSyncTimeUID(collectionUID)
    )) ?? 0;

const setPublicCollectionLastSyncTime = async (
    collectionUID: string,
    time: number
) => await localForage.setItem(getCollectionSyncTimeUID(collectionUID), time);

export const syncPublicFiles = async (
    token: string,
    collection: Collection,
    setPublicFiles: (files: EnteFile[]) => void
) => {
    try {
        let files: EnteFile[] = [];
        const localFiles = await getLocalPublicFiles(collection);
        files.push(...localFiles);
        try {
            if (!token) {
                return files;
            }
            const lastSyncTime = await getPublicCollectionLastSyncTime(
                getCollectionUID(collection)
            );
            if (collection.updationTime === lastSyncTime) {
                return files;
            }
            const fetchedFiles = await getPublicFiles(
                token,
                collection,
                lastSyncTime,
                files,
                setPublicFiles
            );

            files.push(...fetchedFiles);
            const latestVersionFiles = new Map<string, EnteFile>();
            files.forEach((file) => {
                const uid = `${file.collectionID}-${file.id}`;
                if (
                    !latestVersionFiles.has(uid) ||
                    latestVersionFiles.get(uid).updationTime < file.updationTime
                ) {
                    latestVersionFiles.set(uid, file);
                }
            });
            files = [];
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for (const [_, file] of latestVersionFiles) {
                if (file.isDeleted) {
                    continue;
                }
                files.push(file);
            }
            await savePublicCollectionFiles(
                getCollectionUID(collection),
                files
            );
            await setPublicCollectionLastSyncTime(
                getCollectionUID(collection),
                collection.updationTime
            );
            setPublicFiles([...sortFiles(mergeMetadata(files))]);
        } catch (e) {
            logError(e, 'failed to sync shared collection files');
        }
        return [...sortFiles(mergeMetadata(files))];
    } catch (e) {
        logError(e, 'failed to get local  or sync shared collection files');
        return [];
    }
};

const getPublicFiles = async (
    token: string,
    collection: Collection,
    sinceTime: number,
    files: EnteFile[],
    setPublicFiles: (files: EnteFile[]) => void
): Promise<EnteFile[]> => {
    try {
        const decryptedFiles: EnteFile[] = [];
        let time = sinceTime;
        let resp;
        do {
            if (!token) {
                break;
            }
            resp = await HTTPService.get(
                `${ENDPOINT}/public-collection/diff`,
                {
                    sinceTime: time,
                },
                {
                    'Cache-Control': 'no-cache',
                    'X-Auth-Access-Token': token,
                }
            );
            decryptedFiles.push(
                ...(await Promise.all(
                    resp.data.diff.map(async (file: EnteFile) => {
                        if (!file.isDeleted) {
                            file = await decryptFile(file, collection.key);
                        }
                        return file;
                    }) as Promise<EnteFile>[]
                ))
            );

            if (resp.data.diff.length) {
                time = resp.data.diff.slice(-1)[0].updationTime;
            }
            setPublicFiles(
                sortFiles(
                    mergeMetadata(
                        [...(files || []), ...decryptedFiles].filter(
                            (item) => !item.isDeleted
                        )
                    )
                )
            );
        } while (resp.data.hasMore);
        return decryptedFiles;
    } catch (e) {
        logError(e, 'Get public  files failed');
        throw e;
    }
};

export const getPublicCollection = async (
    token: string,
    collectionKey: string
): Promise<Collection> => {
    try {
        if (!token) {
            return;
        }
        const resp = await HTTPService.get(
            `${ENDPOINT}/public-collection/info`,
            null,
            { 'Cache-Control': 'no-cache', 'X-Auth-Access-Token': token }
        );
        const fetchedCollection = resp.data?.collection;
        const collectionName = await decryptCollectionName(
            fetchedCollection,
            collectionKey
        );
        const collection = {
            ...fetchedCollection,
            name: collectionName,
            key: collectionKey,
        };
        await savePublicCollection(collection);
        return collection;
    } catch (error) {
        logError(error, 'failed to get public collection', {
            collectionKey,
            token,
        });
        if ('status' in error) {
            const errorCode = error.status.toString();
            if (
                errorCode === ServerErrorCodes.SESSION_EXPIRED ||
                errorCode === ServerErrorCodes.TOKEN_EXPIRED
            ) {
                throw Error(CustomError.TOKEN_EXPIRED);
            }
        }
    }
};

const decryptCollectionName = async (
    collection: Collection,
    collectionKey: string
) => {
    const worker = await new CryptoWorker();

    return (collection.name =
        collection.name ||
        (await worker.decryptToUTF8(
            collection.encryptedName,
            collection.nameDecryptionNonce,
            collectionKey
        )));
};

export const reportAbuse = async (
    token: string,
    url: string,
    reason: REPORT_REASON,
    details: AbuseReportDetails
) => {
    try {
        if (!token) {
            return;
        }
        const abuseReportRequest: AbuseReportRequest = { url, reason, details };

        await HTTPService.post(
            `${ENDPOINT}/public-collection/report-abuse`,
            abuseReportRequest,
            null,
            { 'X-Auth-Access-Token': token }
        );
    } catch (e) {
        logError(e, 'failed to post abuse report');
        throw e;
    }
};

export const removePublicCollectionWithFiles = async (
    collectionKey: string
) => {
    const publicCollections =
        (await localForage.getItem<Collection[]>(PUBLIC_COLLECTIONS_TABLE)) ??
        [];
    const collectionToRemove = publicCollections.find(
        (collection) => (collection.key = collectionKey)
    );
    if (!collectionToRemove) {
        return;
    }
    await localForage.setItem(
        PUBLIC_COLLECTIONS_TABLE,
        publicCollections.filter(
            (collection) => collection.id !== collectionToRemove.id
        )
    );

    const publicCollectionFiles =
        (await localForage.getItem<LocalSavedPublicCollectionFiles[]>(
            PUBLIC_COLLECTION_FILES_TABLE
        )) ?? [];
    await localForage.setItem(
        PUBLIC_COLLECTION_FILES_TABLE,
        publicCollectionFiles.filter(
            (collectionFiles) =>
                collectionFiles.collectionUID ===
                getCollectionUID(collectionToRemove)
        )
    );
};