import React from "react";
import { ProtoButton, useColorScheme } from "@opencast/appkit";

import { COLORS, focusStyle } from "../util";
import { ShortcutKeys } from "../shortcuts";



export type SourceOptionButtonProps = {
  icon: JSX.Element;
  label: string;
  onClick: () => void;
  disabledText?: false | string;
  shortcut?: string;
  ariaLabel?: string;
};

export const SourceOptionButton: React.FC<SourceOptionButtonProps> = (
  { icon, label, onClick, shortcut, disabledText, ariaLabel },
) => {
  const { isHighContrast } = useColorScheme();

  return (
    <ProtoButton
      onClick={onClick}
      disabled={!!disabledText}
      aria-label={ariaLabel}
      css={{
        position: "relative",
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        maxHeight: 250,
        maxWidth: 420,
        padding: 12,
        flex: "1",

        backgroundColor: COLORS.neutral05,
        color: COLORS.accent7,
        borderRadius: 8,
        border: `1px solid ${COLORS.neutral20}`,

        "&[disabled]": {
          backgroundColor: COLORS.neutral10,
          color: COLORS.neutral50,
          borderColor: COLORS.neutral15,
        },

        "&:not([disabled]):hover, &:not([disabled]):focus-visible": {
          color: COLORS.accent8,
          borderColor: COLORS.neutral30,
          boxShadow: "0 0 16px var(--shadow-color)",
          ...isHighContrast && {
            outline: `2px solid ${COLORS.accent4}`,
            borderColor: "transparent",
            boxShadow: "none",
          },
        },
        ...focusStyle({ offset: -1 }),
      }}
    >
      <div css={{
        borderRadius: "50%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontSize: 40,
        width: 80,
        height: 80,
        backgroundColor: COLORS.neutral10,
        marginBottom: 8,
      }}>
        {icon}
      </div>
      <div css={{ fontSize: 18, fontWeight: 700 }}>{label}</div>
      <div css={{ height: "1lh", fontSize: 14, marginTop: 4 }}>{disabledText}</div>
      {shortcut && <div css={{
        position: "absolute",
        right: 8,
        bottom: 8,
      }}><ShortcutKeys shortcut={shortcut} /></div>}
    </ProtoButton>
  );
};
