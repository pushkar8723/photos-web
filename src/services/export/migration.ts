import { getLocalCollections } from 'services/collectionService';
import { getLocalFiles } from 'services/fileService';
import {
    ExportRecordV1,
    ExportRecordV2,
    ExportRecord,
    FileExportNames,
    ExportRecordV0,
    CollectionExportNames,
} from 'types/export';
import { EnteFile } from 'types/file';
import { User } from 'types/user';
import { getNonEmptyPersonalCollections } from 'utils/collection';
import { getExportRecordFileUID, getLivePhotoExportName } from 'utils/export';
import {
    getIDBasedSortedFiles,
    getPersonalFiles,
    mergeMetadata,
} from 'utils/file';
import { addLocalLog, addLogLine } from 'utils/logging';
import { logError } from 'utils/sentry';
import { getData, LS_KEYS } from 'utils/storage/localStorage';
import exportService from './index';
import { Collection } from 'types/collection';
import {
    getExportedFiles,
    convertCollectionIDFolderPathObjectToMap,
    getUniqueFileExportNameForMigration,
    getOldCollectionFolderPath,
    getUniqueCollectionFolderPath,
    getUniqueFileSaveName,
    getOldFileSavePath,
    getOldFileMetadataSavePath,
    getFileMetadataSavePath,
    getFileSavePath,
} from 'utils/export/migration';
import { FILE_TYPE } from 'constants/file';
import { decodeLivePhoto } from 'services/livePhotoService';
import downloadManager from 'services/downloadManager';
import { retryAsyncFunction } from 'utils/network';
import { CustomError } from 'utils/error';

export async function migrateExportJSON(
    exportDir: string,
    exportRecord: ExportRecord
) {
    try {
        if (!exportDir) {
            return;
        }
        await migrateExport(exportDir, exportRecord);
    } catch (e) {
        logError(e, 'migrateExportJSON failed');
        throw e;
    }
}

/*
    this function migrates the exportRecord file to apply any schema changes.
    currently we apply only a single migration to update file and collection name to newer format
    so there is just a if condition check, 
    later this will be converted to a loop which applies the migration one by one 
    till the files reaches the latest version 
*/
async function migrateExport(
    exportDir: string,
    exportRecord: ExportRecordV1 | ExportRecordV2 | ExportRecord
) {
    try {
        if (!exportRecord?.version) {
            exportRecord = {
                ...exportRecord,
                version: 0,
            };
        }
        addLogLine(`current export version: ${exportRecord.version}`);
        if (exportRecord.version === 0) {
            addLogLine('migrating export to version 1');
            await migrationV0ToV1(exportDir, exportRecord as ExportRecordV0);
            exportRecord = await exportService.updateExportRecord({
                version: 1,
            });
            addLogLine('migration to version 1 complete');
        }
        if (exportRecord.version === 1) {
            addLogLine('migrating export to version 2');
            await migrationV1ToV2(exportRecord as ExportRecordV1);
            exportRecord = await exportService.updateExportRecord({
                version: 2,
            });
            addLogLine('migration to version 2 complete');
        }
        if (exportRecord.version === 2) {
            addLogLine('migrating export to version 3');
            await migrationV2ToV3(exportDir, exportRecord as ExportRecordV2);
            exportRecord = await exportService.updateExportRecord({
                version: 3,
            });
            addLogLine('migration to version 3 complete');
        }
        addLogLine(`Record at latest version`);
    } catch (e) {
        logError(e, 'export record migration failed');
    }
}

async function migrationV0ToV1(
    exportDir: string,
    exportRecord: ExportRecordV0
) {
    if (!exportRecord?.exportedFiles) {
        return;
    }
    const collectionIDPathMap = new Map<number, string>();
    const user: User = getData(LS_KEYS.USER);
    const localFiles = mergeMetadata(await getLocalFiles());
    const localCollections = await getLocalCollections();
    const personalFiles = getIDBasedSortedFiles(
        getPersonalFiles(localFiles, user)
    );
    const nonEmptyPersonalCollections = getNonEmptyPersonalCollections(
        localCollections,
        personalFiles,
        user
    );
    await migrateCollectionFolders(
        nonEmptyPersonalCollections,
        exportDir,
        collectionIDPathMap
    );
    await migrateFiles(
        getExportedFiles(personalFiles, exportRecord),
        collectionIDPathMap
    );
}

async function migrationV1ToV2(exportRecord: ExportRecordV1) {
    await removeDeprecatedExportRecordProperties(exportRecord);
}

async function migrationV2ToV3(
    exportDir: string,
    exportRecord: ExportRecordV2
) {
    if (!exportRecord?.exportedFiles) {
        return;
    }
    const user: User = getData(LS_KEYS.USER);
    const localFiles = await getLocalFiles();
    const personalFiles = getIDBasedSortedFiles(
        getPersonalFiles(localFiles, user)
    );

    const collectionExportNames =
        await getCollectionExportNamesFromExportedCollectionPaths(
            exportDir,
            exportRecord
        );

    const fileExportNames = await getFileExportNamesFromExportedFiles(
        exportRecord,
        getExportedFiles(personalFiles, exportRecord)
    );

    exportRecord.exportedCollectionPaths = undefined;
    exportRecord.exportedFiles = undefined;
    const updatedExportRecord: ExportRecord = {
        ...exportRecord,
        fileExportNames,
        collectionExportNames,
    };
    await exportService.updateExportRecord(updatedExportRecord);
}

/*
    This updates the folder name of already exported folders from the earlier format of 
    `collectionID_collectionName` to newer `collectionName(numbered)` format
*/
async function migrateCollectionFolders(
    collections: Collection[],
    exportDir: string,
    collectionIDPathMap: Map<number, string>
) {
    for (const collection of collections) {
        const oldCollectionExportPath = getOldCollectionFolderPath(
            exportDir,
            collection.id,
            collection.name
        );
        const newCollectionExportPath = getUniqueCollectionFolderPath(
            exportDir,
            collection.name
        );
        collectionIDPathMap.set(collection.id, newCollectionExportPath);
        if (!exportService.exists(oldCollectionExportPath)) {
            continue;
        }
        await exportService.rename(
            oldCollectionExportPath,
            newCollectionExportPath
        );
        await addCollectionExportedRecordV1(
            exportDir,
            collection.id,
            newCollectionExportPath
        );
    }
}

/*
    This updates the file name of already exported files from the earlier format of 
    `fileID_fileName` to newer `fileName(numbered)` format
*/
async function migrateFiles(
    files: EnteFile[],
    collectionIDPathMap: Map<number, string>
) {
    for (const file of files) {
        const oldFileSavePath = getOldFileSavePath(
            collectionIDPathMap.get(file.collectionID),
            file
        );
        const oldFileMetadataSavePath = getOldFileMetadataSavePath(
            collectionIDPathMap.get(file.collectionID),
            file
        );
        const newFileSaveName = getUniqueFileSaveName(
            collectionIDPathMap.get(file.collectionID),
            file.metadata.title
        );

        const newFileSavePath = getFileSavePath(
            collectionIDPathMap.get(file.collectionID),
            newFileSaveName
        );

        const newFileMetadataSavePath = getFileMetadataSavePath(
            collectionIDPathMap.get(file.collectionID),
            newFileSaveName
        );
        if (!exportService.exists(oldFileSavePath)) {
            continue;
        }
        await exportService.rename(oldFileSavePath, newFileSavePath);
        await exportService.rename(
            oldFileMetadataSavePath,
            newFileMetadataSavePath
        );
    }
}

async function removeDeprecatedExportRecordProperties(
    exportRecord: ExportRecordV1
) {
    if (exportRecord?.queuedFiles) {
        exportRecord.queuedFiles = undefined;
    }
    if (exportRecord?.progress) {
        exportRecord.progress = undefined;
    }
    if (exportRecord?.failedFiles) {
        exportRecord.failedFiles = undefined;
    }
    await exportService.updateExportRecord(exportRecord);
}

async function getCollectionExportNamesFromExportedCollectionPaths(
    exportDir: string,
    exportRecord: ExportRecordV2
): Promise<CollectionExportNames> {
    if (!exportRecord.exportedCollectionPaths) {
        return;
    }
    const exportedCollectionNames = Object.fromEntries(
        Object.entries(exportRecord.exportedCollectionPaths).map(
            ([key, value]) => [key, value.replace(exportDir, '').slice(1)]
        )
    );
    return exportedCollectionNames;
}

/* 
    Earlier the file were sorted by id,
    which we can use to determine which file got which number suffix
    this can be used to determine the filepaths of the those already exported files
    and update the exportedFilePaths property of the exportRecord
    This is based on the assumption new files have higher ids than the older ones
*/
async function getFileExportNamesFromExportedFiles(
    exportRecord: ExportRecordV2,
    exportedFiles: EnteFile[]
): Promise<FileExportNames> {
    if (!exportedFiles.length) {
        return;
    }
    addLogLine(
        'updating exported files to exported file paths property',
        `got ${exportedFiles.length} files`
    );
    let exportedFileNames: FileExportNames;
    const usedFilePaths = new Map<string, Set<string>>();
    const exportedCollectionPaths = convertCollectionIDFolderPathObjectToMap(
        exportRecord.exportedCollectionPaths
    );
    for (const file of exportedFiles) {
        const collectionPath = exportedCollectionPaths.get(file.collectionID);
        addLocalLog(
            () =>
                `collection path for ${file.collectionID} is ${collectionPath}`
        );
        let fileExportName: string;
        /*
            For Live Photos we need to download the file to get the image and video name
        */
        if (file.metadata.fileType === FILE_TYPE.LIVE_PHOTO) {
            const fileStream = await retryAsyncFunction(() =>
                downloadManager.downloadFile(file)
            );
            const fileBlob = await new Response(fileStream).blob();
            const livePhoto = await decodeLivePhoto(file, fileBlob);
            const imageExportName = getUniqueFileExportNameForMigration(
                collectionPath,
                livePhoto.imageNameTitle,
                usedFilePaths
            );
            const videoExportName = getUniqueFileExportNameForMigration(
                collectionPath,
                livePhoto.videoNameTitle,
                usedFilePaths
            );
            fileExportName = getLivePhotoExportName(
                imageExportName,
                videoExportName
            );
        } else {
            fileExportName = getUniqueFileExportNameForMigration(
                collectionPath,
                file.metadata.title,
                usedFilePaths
            );
        }
        addLocalLog(
            () =>
                `file export name for ${file.metadata.title} is ${fileExportName}`
        );
        exportedFileNames = {
            ...exportedFileNames,
            [getExportRecordFileUID(file)]: fileExportName,
        };
    }
    return exportedFileNames;
}

async function addCollectionExportedRecordV1(
    folder: string,
    collectionID: number,
    collectionExportPath: string
) {
    try {
        const exportRecord = (await exportService.getExportRecord(
            folder
        )) as unknown as ExportRecordV1;
        if (!exportRecord?.exportedCollectionPaths) {
            exportRecord.exportedCollectionPaths = {};
        }
        exportRecord.exportedCollectionPaths = {
            ...exportRecord.exportedCollectionPaths,
            [collectionID]: collectionExportPath,
        };

        await exportService.updateExportRecord(exportRecord, folder);
    } catch (e) {
        logError(e, 'addCollectionExportedRecord failed');
        throw Error(CustomError.ADD_FILE_EXPORTED_RECORD_FAILED);
    }
}