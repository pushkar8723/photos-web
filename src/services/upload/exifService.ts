import { EXIFLESS_FORMATS, NULL_LOCATION } from 'constants/upload';
import { GeoLocation } from 'types/upload';
import exifr from 'exifr';
import piexif from 'piexifjs';
import { FileTypeInfo } from 'types/upload';
import { logError } from 'utils/sentry';
import { CustomError } from 'utils/error';

const EXIFR_UNSUPPORTED_FILE_FORMAT_MESSAGE = 'Unknown file format';

export type ParsedEXIFData = Record<string, any> &
    Partial<{
        dateTimeOriginal: Date;
        createDate: Date;
        modifyDate: Date;
        dateCreated: Date;
        latitude: number;
        longitude: number;
        imageWidth: number;
        imageHeight: number;
        fNumber: number;
        takenOnDevice: string;
        exposureTime: number;
        iso: number;
    }>;

type RawEXIFData = Record<string, any> &
    Partial<{
        DateTimeOriginal: string;
        CreateDate: string;
        ModifyDate: string;
        DateCreated: string;
        GPSLatitude: number[];
        GPSLongitude: number[];
        GPSLatitudeRef: string;
        GPSLongitudeRef: string;
        ImageWidth: number;
        ImageHeight: number;
        ExifImageWidth: number;
        ExifImageHeight: number;
        PixelXDimension: number;
        PixelYDimension: number;
        FNumber: number;
        ApertureValue: number;
        FocalLength: number;
        Make: string;
        Model: string;
        ExposureTime: number;
        ISO: number;
    }>;

export async function getParsedExifData(
    receivedFile: File,
    fileTypeInfo: FileTypeInfo,
    tags?: string[]
): Promise<ParsedEXIFData> {
    try {
        if (EXIFLESS_FORMATS.includes(fileTypeInfo.exactType)) {
            return null;
        }
        const exifData: RawEXIFData = await exifr.parse(receivedFile, {
            reviveValues: false,
            tiff: true,
            xmp: true,
            icc: true,
            iptc: true,
            jfif: true,
            ihdr: true,
        });
        if (!exifData) {
            return null;
        }
        const filteredExifData = tags
            ? Object.fromEntries(
                  Object.entries(exifData).filter(([key]) => tags.includes(key))
              )
            : exifData;
        return parseExifData(filteredExifData);
    } catch (e) {
        if (e.message === EXIFR_UNSUPPORTED_FILE_FORMAT_MESSAGE) {
            logError(e, 'exif library unsupported format', {
                fileType: fileTypeInfo.exactType,
            });
        } else {
            logError(e, 'get parsed exif data failed', {
                fileType: fileTypeInfo.exactType,
            });
            throw e;
        }
    }
}

function parseExifData(exifData: RawEXIFData): ParsedEXIFData {
    if (!exifData) {
        return null;
    }

    const {
        DateTimeOriginal,
        CreateDate,
        ModifyDate,
        DateCreated,
        ImageHeight,
        ImageWidth,
        ExifImageHeight,
        ExifImageWidth,
        GPSLatitude,
        GPSLatitudeRef,
        GPSLongitude,
        GPSLongitudeRef,
        FNumber,
        ApertureValue,
        FocalLength,
        Make,
        Model,
        ExposureTime,
        ISO,
        PixelXDimension,
        PixelYDimension,
        ...rest
    } = exifData;
    const parsedExif: ParsedEXIFData = { ...rest };
    if (DateTimeOriginal) {
        parsedExif.dateTimeOriginal = parseEXIFDate(DateTimeOriginal);
    }
    if (CreateDate) {
        parsedExif.createDate = parseEXIFDate(CreateDate);
    }
    if (ModifyDate) {
        parsedExif.modifyDate = parseEXIFDate(ModifyDate);
    }
    if (DateCreated) {
        parsedExif.dateCreated = parseEXIFDate(DateCreated);
    }
    if (GPSLatitude && GPSLongitude) {
        const parsedLocation = parseEXIFLocation(
            GPSLatitude,
            GPSLatitudeRef,
            GPSLongitude,
            GPSLongitudeRef
        );
        parsedExif.latitude = parsedLocation.latitude;
        parsedExif.longitude = parsedLocation.longitude;
    }
    if (ImageWidth && ImageHeight) {
        if (typeof ImageWidth === 'number' && typeof ImageHeight === 'number') {
            parsedExif.imageWidth = ImageWidth;
            parsedExif.imageHeight = ImageHeight;
        } else {
            logError(
                new Error('ImageWidth or ImageHeight is not a number'),
                'Image dimension parsing failed',
                {
                    ImageWidth,
                    ImageHeight,
                }
            );
        }
    } else if (ExifImageWidth && ExifImageHeight) {
        if (
            typeof ExifImageWidth === 'number' &&
            typeof ExifImageHeight === 'number'
        ) {
            parsedExif.imageWidth = ExifImageWidth;
            parsedExif.imageHeight = ExifImageHeight;
        } else {
            logError(
                new Error('ExifImageWidth or ExifImageHeight is not a number'),
                'Image dimension parsing failed',
                {
                    ExifImageWidth,
                    ExifImageHeight,
                }
            );
        }
    } else if (PixelXDimension && PixelYDimension) {
        if (
            typeof PixelXDimension === 'number' &&
            typeof PixelYDimension === 'number'
        ) {
            parsedExif.imageWidth = PixelXDimension;
            parsedExif.imageHeight = PixelYDimension;
        } else {
            logError(
                new Error('PixelXDimension or PixelYDimension is not a number'),
                'Image dimension parsing failed',
                {
                    PixelXDimension,
                    PixelYDimension,
                }
            );
        }
    }
    if (FNumber) {
        parsedExif.fNumber = FNumber;
    } else if (ApertureValue && FocalLength) {
        if (
            typeof ApertureValue === 'number' &&
            typeof FocalLength === 'number'
        ) {
            parsedExif.fNumber = Math.ceil(FocalLength / ApertureValue);
        } else {
            logError(
                new Error('ApertureValue or FocalLength is not a number'),
                'FNumber parsing failed',
                {
                    ApertureValue,
                    FocalLength,
                }
            );
        }
    }
    if (Make && Model) {
        parsedExif.takenOnDevice = `${Make} ${Model}`;
    }
    if (ExposureTime) {
        parsedExif.exposureTime = ExposureTime;
    }
    if (ISO) {
        parsedExif.iso = ISO;
    }

    return parsedExif;
}

function parseEXIFDate(dateTimeString: string) {
    try {
        if (typeof dateTimeString !== 'string' || dateTimeString === '') {
            throw Error(CustomError.NOT_A_DATE);
        }

        // Check and parse date in the format YYYYMMDD
        if (dateTimeString.length === 8) {
            const year = Number(dateTimeString.slice(0, 4));
            const month = Number(dateTimeString.slice(4, 6));
            const day = Number(dateTimeString.slice(6, 8));
            if (
                !Number.isNaN(year) &&
                !Number.isNaN(month) &&
                !Number.isNaN(day)
            ) {
                const date = new Date(year, month - 1, day);
                if (!Number.isNaN(+date)) {
                    return date;
                }
            }
        }
        const [year, month, day, hour, minute, second] = dateTimeString
            .match(/\d+/g)
            .map(Number);

        if (
            typeof year === 'undefined' ||
            Number.isNaN(year) ||
            typeof month === 'undefined' ||
            Number.isNaN(month) ||
            typeof day === 'undefined' ||
            Number.isNaN(day)
        ) {
            throw Error(CustomError.NOT_A_DATE);
        }
        let date: Date;
        if (
            typeof hour === 'undefined' ||
            Number.isNaN(hour) ||
            typeof minute === 'undefined' ||
            Number.isNaN(minute) ||
            typeof second === 'undefined' ||
            Number.isNaN(second)
        ) {
            date = new Date(year, month - 1, day);
        } else {
            date = new Date(year, month - 1, day, hour, minute, second);
        }
        if (Number.isNaN(+date)) {
            throw Error(CustomError.NOT_A_DATE);
        }
        return date;
    } catch (e) {
        logError(e, 'parseEXIFDate failed', {
            dateTimeString,
        });
        return null;
    }
}

export function parseEXIFLocation(
    gpsLatitude: number[],
    gpsLatitudeRef: string,
    gpsLongitude: number[],
    gpsLongitudeRef: string
) {
    try {
        if (
            !Array.isArray(gpsLatitude) ||
            !Array.isArray(gpsLongitude) ||
            gpsLatitude.length !== 3 ||
            gpsLongitude.length !== 3
        ) {
            throw Error(CustomError.NOT_A_LOCATION);
        }
        const latitude = convertDMSToDD(
            gpsLatitude[0],
            gpsLatitude[1],
            gpsLatitude[2],
            gpsLatitudeRef
        );
        const longitude = convertDMSToDD(
            gpsLongitude[0],
            gpsLongitude[1],
            gpsLongitude[2],
            gpsLongitudeRef
        );
        const parsedLocation = {
            latitude,
            longitude,
        };
        if (!isValidGeoLocation(parsedLocation)) {
            throw Error(CustomError.NOT_A_LOCATION);
        }
        return parsedLocation;
    } catch (e) {
        logError(e, 'parseEXIFLocation failed', {
            gpsLatitude,
            gpsLatitudeRef,
            gpsLongitude,
            gpsLongitudeRef,
        });
        return NULL_LOCATION;
    }
}

function convertDMSToDD(
    degrees: number,
    minutes: number,
    seconds: number,
    direction: string
) {
    let dd = degrees + minutes / 60 + seconds / (60 * 60);
    if (direction === 'S' || direction === 'W') dd *= -1;
    return dd;
}

export async function updateFileCreationDateInEXIF(
    reader: FileReader,
    fileBlob: Blob,
    updatedDate: Date
) {
    try {
        let imageDataURL = await convertImageToDataURL(reader, fileBlob);
        imageDataURL =
            'data:image/jpeg;base64' +
            imageDataURL.slice(imageDataURL.indexOf(','));
        const exifObj = piexif.load(imageDataURL);
        if (!exifObj['Exif']) {
            exifObj['Exif'] = {};
        }
        exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] =
            convertToExifDateFormat(updatedDate);

        const exifBytes = piexif.dump(exifObj);
        const exifInsertedFile = piexif.insert(exifBytes, imageDataURL);
        return dataURIToBlob(exifInsertedFile);
    } catch (e) {
        logError(e, 'updateFileModifyDateInEXIF failed');
        return fileBlob;
    }
}

async function convertImageToDataURL(reader: FileReader, blob: Blob) {
    const dataURL = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });
    return dataURL;
}

function dataURIToBlob(dataURI: string) {
    // convert base64 to raw binary data held in a string
    // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
    const byteString = atob(dataURI.split(',')[1]);

    // separate out the mime component
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

    // write the bytes of the string to an ArrayBuffer
    const ab = new ArrayBuffer(byteString.length);

    // create a view into the buffer
    const ia = new Uint8Array(ab);

    // set the bytes of the buffer to the correct values
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    // write the ArrayBuffer to a blob, and you're done
    const blob = new Blob([ab], { type: mimeString });
    return blob;
}

function convertToExifDateFormat(date: Date) {
    return `${date.getFullYear()}:${
        date.getMonth() + 1
    }:${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
}

export function isValidGeoLocation(location: GeoLocation) {
    return (
        (location.latitude || location.latitude === 0) &&
        (location.longitude || location.longitude === 0) &&
        !(location.longitude === 0 && location.latitude === 0)
    );
}
