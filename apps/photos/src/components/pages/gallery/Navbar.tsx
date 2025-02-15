import React from 'react';
import NavbarBase from '@ente/shared/components/Navbar/base';
import SidebarToggler from '@ente/shared/components/Navbar/SidebarToggler';
import SearchBar from 'components/Search/SearchBar';
import { Collection } from 'types/collection';
import { EnteFile } from 'types/file';
import { UpdateSearch } from 'types/search';
import UploadButton from 'components/Upload/UploadButton';
import { IconButton, Typography } from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { FlexWrapper, HorizontalFlex } from '@ente/shared/components/Container';
import { t } from 'i18next';
import { AppContext } from 'pages/_app';

interface Iprops {
    openSidebar: () => void;
    isFirstFetch: boolean;
    openUploader: () => void;
    isInSearchMode: boolean;
    isInHiddenSection: boolean;
    setIsInSearchMode: (v: boolean) => void;
    collections: Collection[];
    files: EnteFile[];
    updateSearch: UpdateSearch;
    exitHiddenSection: () => void;
}
export function GalleryNavbar({
    openSidebar,
    openUploader,
    isInSearchMode,
    isInHiddenSection,
    collections,
    files,
    updateSearch,
    setIsInSearchMode,
    exitHiddenSection,
}: Iprops) {
    const appContext = React.useContext(AppContext);
    return (
        <NavbarBase
            sx={{ background: 'transparent', position: 'absolute' }}
            isMobile={appContext.isMobile}>
            {isInHiddenSection ? (
                <HorizontalFlex
                    gap={'24px'}
                    sx={{
                        width: '100%',
                        background: (theme) => theme.palette.background.default,
                    }}>
                    <IconButton onClick={exitHiddenSection}>
                        <ArrowBack />
                    </IconButton>
                    <FlexWrapper>
                        <Typography>{t('HIDDEN')}</Typography>
                    </FlexWrapper>
                </HorizontalFlex>
            ) : (
                <>
                    {!isInSearchMode && (
                        <SidebarToggler openSidebar={openSidebar} />
                    )}
                    <SearchBar
                        isInSearchMode={isInSearchMode}
                        setIsInSearchMode={setIsInSearchMode}
                        collections={collections}
                        files={files}
                        updateSearch={updateSearch}
                    />
                    {!isInSearchMode && (
                        <UploadButton openUploader={openUploader} />
                    )}
                </>
            )}
        </NavbarBase>
    );
}
