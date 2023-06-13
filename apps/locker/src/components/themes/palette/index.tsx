import { PaletteOptions, ThemeColorsOptions } from '@mui/material';

type THEME_COLOR = string;

export const getPallette = (
    themeColor: THEME_COLOR,
    colors: ThemeColorsOptions
): PaletteOptions => {
    const paletteOptions = getPalletteOptions(themeColor, colors);
    switch (themeColor) {
        // case THEME_COLOR.LIGHT:
        //     return { mode: 'light', ...paletteOptions };
        default:
            return { mode: 'dark', ...paletteOptions };
    }
};

export const getPalletteOptions = (
    themeColor: THEME_COLOR,
    colors: ThemeColorsOptions
): PaletteOptions => {
    return {
        primary: {
            main: colors.fill!.base as string,
            dark: colors.fill!.basePressed,
            contrastText:
                themeColor === 'dark' ? colors.black!.base : colors.white!.base,
        },
        secondary: {
            main: colors.fill!.faint as string,
            dark: colors.fill!.faintPressed,
            contrastText: colors.text!.base,
        },
        accent: {
            main: colors.accent!.A500 as string,
            dark: colors.accent!.A700,
            contrastText: colors.white!.base,
        },
        critical: {
            main: colors.danger!.A700 as string,
            dark: colors.danger!.A800,
            contrastText: colors.white!.base,
        },
        background: {
            default: colors.background!.base,
            paper: colors.background!.elevated,
        },
        text: {
            primary: colors.text!.base,
            secondary: colors.text!.muted,
            disabled: colors.text!.faint,
            base: colors.text!.base,
            muted: colors.text!.muted,
            faint: colors.text!.faint,
        },
        divider: colors.stroke!.faint,
    };
};