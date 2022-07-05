import React from 'react';
import constants from 'utils/strings/constants';
import { default as FileUploadIcon } from '@mui/icons-material/ImageOutlined';
import { default as FolderUploadIcon } from '@mui/icons-material/PermMediaOutlined';
import GoogleIcon from '@mui/icons-material/Google';
import { UploadTypeOption } from './option';
import DialogTitleWithCloseButton from 'components/DialogBox/TitleWithCloseButton';
import { Dialog, DialogContent, Stack } from '@mui/material';

export default function UploadTypeSelector({
    onHide,
    show,
    uploadFiles,
    uploadFolders,
    uploadGoogleTakeoutZips,
}) {
    return (
        <Dialog
            open={show}
            PaperProps={{ sx: { maxWidth: '375px' } }}
            onClose={onHide}>
            <DialogTitleWithCloseButton onClose={onHide}>
                {constants.UPLOAD}
            </DialogTitleWithCloseButton>
            <DialogContent sx={{ '&&&&': { pt: 0 } }}>
                <Stack spacing={1}>
                    <UploadTypeOption
                        uploadFunc={uploadFiles}
                        Icon={FileUploadIcon}
                        uploadName={constants.UPLOAD_FILES}
                    />
                    <UploadTypeOption
                        uploadFunc={uploadFolders}
                        Icon={FolderUploadIcon}
                        uploadName={constants.UPLOAD_DIRS}
                    />
                    <UploadTypeOption
                        uploadFunc={uploadGoogleTakeoutZips}
                        Icon={GoogleIcon}
                        uploadName={constants.UPLOAD_GOOGLE_TAKEOUT}
                    />
                </Stack>
            </DialogContent>
        </Dialog>
    );
}