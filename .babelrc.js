"use strict";

// eslint-disable-next-line no-undef
module.exports = {
  parserOpts: {
    strictMode: true,
  },
  plugins: ["@emotion"],
  presets: [
    ["@babel/preset-env", {
      // Set to `true` to show which transforms will be run
      // during the build
      debug: false,
    }],
    [
      "@babel/preset-typescript",
      {
        allowDeclareFields: true,
      },
    ],
    [
      "@babel/preset-react",
      {
        runtime: "automatic",
        importSource: "@emotion/react",
      },
    ],
  ],
};
