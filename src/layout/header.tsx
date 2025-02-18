import { HiOutlineTranslate } from "react-icons/hi";
import { FiInfo, FiMoon } from "react-icons/fi";
import {
  HeaderMenuItemProps, useColorScheme, WithHeaderMenu, checkboxMenuItem, ProtoButton,
  screenWidthAtMost, match,
} from "@opencast/appkit";
import { useTranslation } from "react-i18next";
import React, { forwardRef } from "react";

import { DEFINES } from "../defines";
import KeyboardIcon from "../icons/keyboard.svg";
import languages from "../i18n/languages";
import { BREAKPOINTS, COLORS, focusStyle } from "../util";
import { OverlayBoxState } from ".";
import { SHORTCUTS, ShortcutKeys, useShortcut, useShowAvailableShortcuts } from "../shortcuts";


type Props = {
  setOverlayBoxState: (state: OverlayBoxState) => void;
  inert: boolean;
};

export const Header: React.FC<Props> = ({ setOverlayBoxState, inert }) => {
  const { scheme, isHighContrast } = useColorScheme();

  return (
    <header {...{ inert: inert ? "" : null }} css={{
      backgroundColor: match(scheme, {
        "light": () => COLORS.neutral60,
        "dark": () => COLORS.neutral20,
        "dark-high-contrast": () => "black",
        "light-high-contrast": () => "black",
      }),
      color: isHighContrast ? "white" : "inherit",
      height: "var(--header-height)",
      display: "flex",
      justifyContent: "space-between",
      ...scheme === "dark-high-contrast"
        ? { borderBottom: "1px solid white" }
        : { paddingBottom: 1 },
    }}>
      <Logo />
      <Buttons {...{ setOverlayBoxState }}/>
    </header>
  );
};

const Logo: React.FC = () => {
  const path = (filename: string) => DEFINES.publicPath + filename;

  return (
    <picture css={{
      height: "100%",
      display: "flex",
      opacity: useColorScheme().scheme === "dark" ? 0.8 : 1.0,
      paddingLeft: 8,
      alignItems: "center",
      "> *": {
        height: "calc(100% - 12px)",
      },
      [screenWidthAtMost(410)]: {
        paddingLeft: 0,
      },
    }}>
      <source media="(min-width: 920px)" srcSet={path("logo-wide.svg")} />
      <img src={path("logo-narrow.svg")} alt="Opencast Studio Logo" />
    </picture>
  );
};

const Buttons: React.FC<Pick<Props, "setOverlayBoxState">> = ({ setOverlayBoxState }) => {
  return (
    <div css={{
      display: "flex",
      gap: 16,
      height: "100%",
      alignItems: "center",
      paddingRight: 24,
      [screenWidthAtMost(410)]: {
        gap: 2,
        paddingRight: 8,
      },
    }}>
      <LanguageButton />
      <ThemeButton />
      <ShortCutsButton open={() => setOverlayBoxState("shortcuts")} />
      <InfoButton open={() => setOverlayBoxState("info")} />
    </div>
  );
};

const LanguageButton: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isCurrentLanguage = (language: string) => language === i18n.resolvedLanguage;

  const menuItems = Object.values(languages).map(lng => checkboxMenuItem({
    checked: isCurrentLanguage(lng.short),
    children: <>{lng.long}</>,
    onClick: () => {
      if (!isCurrentLanguage(lng.short)) {
        i18n.changeLanguage(lng.short);
      }
    },
  }));

  const label = t("header.language.label");
  return (
    <WithHeaderMenu
      menu={{
        label,
        items: menuItems,
        breakpoint: BREAKPOINTS.small,
      }}
    >
      <HeaderButton icon={<HiOutlineTranslate />} label={label} />
    </WithHeaderMenu>
  );
};

const ThemeButton: React.FC = () => {
  const { t } = useTranslation();
  const { scheme, isAuto, update } = useColorScheme();

  const currentPref = isAuto ? "auto" : scheme;
  const choices = ["auto", "light", "dark", "light-high-contrast", "dark-high-contrast"] as const;
  const menuItems: HeaderMenuItemProps[] = choices.map(choice => checkboxMenuItem({
    checked: currentPref === choice,
    children: <>{t(`header.theme.${choice}`)}</>,
    onClick: () => update(choice),
  }));

  return (
    <WithHeaderMenu
      menu={{
        label: t("header.theme.label"),
        items: menuItems,
        breakpoint: BREAKPOINTS.small,
      }}
    >
      <HeaderButton icon={<FiMoon />} label={t("header.theme.label")} />
    </WithHeaderMenu>
  );
};

type BoxOpenButtonProps = {
  open: () => void;
};

const InfoButton: React.FC<BoxOpenButtonProps> = ({ open }) => {
  const { t } = useTranslation();
  return (
    <HeaderButton onClick={open} icon={<FiInfo />} label={t("header.info.label")} />
  );
};

const ShortCutsButton: React.FC<BoxOpenButtonProps> = ({ open }) => {
  const { t } = useTranslation();
  useShortcut(SHORTCUTS.general.showOverview, open, { ignoreModifiers: true });
  const showShortcut = useShowAvailableShortcuts();
  return (
    <HeaderButton onClick={open} icon={<KeyboardIcon />} label={t("shortcuts.label")}>
      {showShortcut && (
        <div css={{
          position: "absolute",
          bottom: -20,
          left: 20,
          padding: 2,
          borderRadius: 4,
          backgroundColor: COLORS.neutral05,
        }}><ShortcutKeys shortcut={SHORTCUTS.general.showOverview} /></div>
      )}
    </HeaderButton>
  );
};

type HeaderButtonProps = JSX.IntrinsicElements["button"] & {
  icon: JSX.Element;
  label: string;
};

const BUTTON_LABEL_BREAKPOINT = 770;

const HeaderButton = forwardRef<HTMLButtonElement, HeaderButtonProps>(
  ({ icon, label, children, ...rest }, ref) => {
    const { scheme, isHighContrast } = useColorScheme();

    return (
      <ProtoButton {...rest} ref={ref} css={{
        position: "relative",
        display: "flex",
        gap: 8,
        alignItems: "center",

        fontSize: 16,
        fontFamily: "inherit",
        fontWeight: 500,
        color: match(scheme, {
          "light": () => COLORS.neutral05,
          "dark": () => COLORS.neutral90,
          "dark-high-contrast": () => "white",
          "light-high-contrast": () => "white",
        }),
        borderRadius: 6,
        padding: "6px 8px",

        ":hover, :active": {
          outline: `2px solid ${isHighContrast ? "#aaa" : COLORS.neutral50}`,
          backgroundColor: match(scheme, {
            "light": () => COLORS.neutral70,
            "dark": () => COLORS.neutral10,
            "dark-high-contrast": () => "none",
            "light-high-contrast": () => "none",
          }),
        },
        ...focusStyle({}, match(scheme, {
          "light": () => COLORS.neutral10,
          "dark": () => COLORS.accent8,
          "dark-high-contrast": () => "#aaa",
          "light-high-contrast": () => "#aaa",
        })),

        "> svg": {
          fontSize: 22,
          [`@media (max-width: ${BUTTON_LABEL_BREAKPOINT}px)`]: {
            fontSize: 26,
          },
        },
      }}>
        {icon}
        <span css={{
          [`@media (max-width: ${BUTTON_LABEL_BREAKPOINT}px)`]: {
            display: "none",
          },
        }}>{label}</span>
        {children}
      </ProtoButton>
    );
  },
);
