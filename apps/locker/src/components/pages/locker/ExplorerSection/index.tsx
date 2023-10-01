import {
    Box,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from '@mui/material';
import { useContext, useEffect } from 'react';
import { LockerDashboardContext } from '@/pages/locker';
import { FILE_SORT_DIRECTION, FILE_SORT_FIELD } from '@/interfaces/sort';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ExplorerRow from './ExplorerRow';
import { Collection } from '@/interfaces/collection';

const fileDataCategories = [
    {
        name: 'Name',
        sortFieldEnum: FILE_SORT_FIELD.NAME,
    },
    {
        name: 'Date Added',
        sortFieldEnum: FILE_SORT_FIELD.DATE_ADDED,
    },
    {
        name: 'Size',
        sortFieldEnum: FILE_SORT_FIELD.SIZE,
    },
    {
        name: 'Kind',
        sortFieldEnum: FILE_SORT_FIELD.FILE_TYPE,
    },
];

const ExplorerSection = () => {
    const {
        // filteredFiles,
        // currentCollection,
        // uncategorizedCollection,
        // fileSortDirection,
        // fileSortField,
        // setFileSortDirection,
        // setFileSortField,
        sortField,
        sortDirection,
        setSortDirection,
        setSortField,
        // collections,
        explorerItems,
        selectedExplorerItems,
        setSelectedExplorerItems,
        setCurrentCollection,
    } = useContext(LockerDashboardContext);

    const upKeyHandler = (currentSelectedIndex: number) => {
        if (currentSelectedIndex === 0) return;
        setSelectedExplorerItems([explorerItems[currentSelectedIndex - 1]]);
    };

    const downKeyHandler = (currentSelectedIndex: number) => {
        if (currentSelectedIndex === explorerItems.length - 1) return;
        setSelectedExplorerItems([explorerItems[currentSelectedIndex + 1]]);
    };

    useEffect(() => {
        const keydownHandler = (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
                if (selectedExplorerItems.length !== 1) return;

                if (selectedExplorerItems[0].type === 'collection') {
                    setCurrentCollection(
                        selectedExplorerItems[0].originalItem as Collection
                    );
                    return;
                }
            }

            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

            if (selectedExplorerItems.length !== 1) {
                if (explorerItems.length > 0) {
                    setSelectedExplorerItems([explorerItems[0]]);
                }
                return;
            }

            const currentSelectedIndex = explorerItems.findIndex(
                (item) => item.id === selectedExplorerItems[0].id
            );

            if (event.key === 'ArrowUp') {
                upKeyHandler(currentSelectedIndex);
            } else if (event.key === 'ArrowDown') {
                downKeyHandler(currentSelectedIndex);
            }
        };

        window.addEventListener('keydown', keydownHandler);

        return () => {
            window.removeEventListener('keydown', keydownHandler);
        };
    }, [explorerItems, selectedExplorerItems]);

    return (
        <>
            {/* <h3>
                {currentCollection?.id === uncategorizedCollection?.id &&
                    t('UNCATEGORIZED')}{' '}
                {t('FILES')}
            </h3> */}
            <TableContainer component={Paper}>
                <Table sx={{ minWidth: 650 }} size="medium">
                    <TableHead>
                        <TableRow>
                            {fileDataCategories.map((category) => (
                                <TableCell
                                    key={category.sortFieldEnum}
                                    align="left"
                                    onClick={() => {
                                        setSortField(category.sortFieldEnum);
                                        setSortDirection(
                                            sortDirection ===
                                                FILE_SORT_DIRECTION.ASC
                                                ? FILE_SORT_DIRECTION.DESC
                                                : FILE_SORT_DIRECTION.ASC
                                        );
                                    }}
                                    sx={{
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                    }}>
                                    <Box
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="space-between">
                                        {category.name}
                                        {sortField === category.sortFieldEnum &&
                                            (sortDirection ===
                                            FILE_SORT_DIRECTION.DESC ? (
                                                <ArrowDropUpIcon />
                                            ) : (
                                                <ArrowDropDownIcon />
                                            ))}
                                    </Box>
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {explorerItems.map((item, index) => (
                            <ExplorerRow
                                item={item}
                                key={item.id}
                                index={index}
                            />
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </>
    );
};

export default ExplorerSection;
