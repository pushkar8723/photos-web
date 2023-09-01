import { Box } from '@mui/material';
import FileComponent from './File';
import { useContext } from 'react';
import { LockerDashboardContext } from '@/pages/locker';
import { t } from 'i18next';

const FilesSection = () => {
    const { filteredFiles, currentCollection, uncategorizedCollection } =
        useContext(LockerDashboardContext);

    return (
        <>
            <h3>
                {currentCollection?.id === uncategorizedCollection?.id &&
                    t('UNCATEGORIZED')}{' '}
                {t('FILES')}
            </h3>
            <Box
                display="grid"
                gridTemplateColumns={'repeat(auto-fill, minmax(200px, 1fr))'}
                gap="1rem"
                width="100%">
                {filteredFiles.map((file) => (
                    <FileComponent file={file} key={file.id} />
                ))}
            </Box>
        </>
    );
};

export default FilesSection;
