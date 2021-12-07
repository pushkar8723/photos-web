import { MLIndex } from 'utils/machineLearning/types';
import localForage from './localForage';

export const mlFilesStore = localForage.createInstance({
    driver: localForage.INDEXEDDB,
    name: 'ml-data',
    version: 1.0,
    storeName: 'files',
});

export const mlPeopleStore = localForage.createInstance({
    driver: localForage.INDEXEDDB,
    name: 'ml-data',
    version: 1.0,
    storeName: 'people',
});

export const mlVersionStore = localForage.createInstance({
    driver: localForage.INDEXEDDB,
    name: 'ml-data',
    version: 1.0,
    storeName: 'versions',
});

export async function getIndexVersion(index: MLIndex): Promise<number> {
    return ((await mlVersionStore.getItem(`${index}`)) as number) || 0;
}

export async function setIndexVersion(
    index: MLIndex,
    version: number
): Promise<number> {
    await mlVersionStore.setItem(`${index}`, version);

    return version;
}

export async function incrementIndexVersion(index: MLIndex): Promise<number> {
    let currentVersion = await getIndexVersion(index);
    currentVersion = currentVersion + 1;
    await setIndexVersion(index, currentVersion);

    return currentVersion;
}

export async function isVersionOutdated(index: MLIndex, thanIndex: MLIndex) {
    const indexVersion = await getIndexVersion(index);
    const thanIndexVersion = await getIndexVersion(thanIndex);

    return indexVersion < thanIndexVersion;
}