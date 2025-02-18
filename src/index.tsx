import React from "react";
import ReactDOM from "react-dom/client";
import { notNullish } from "@opencast/appkit";

import "./i18n";
import { SettingsManager, Provider as SettingsProvider } from "./settings";
import { Opencast, Provider as OpencastProvider } from "./opencast";
import { userHasWebcam, sleep } from "./util";
import { Provider as StudioStateProvier } from "./studio-state";


// Load the rest of the application and try to fetch the settings file from the
// server.
const initialize = Promise.all([
  // Load rest of the application code
  import("./App").then(mod => mod.App),

  // Check for camera devices
  userHasWebcam(),

  // Load the settings and initialize Opencast
  SettingsManager.init().then(async settingsManager => {

    // We wait for at most 300ms for `updateUser` to return. In the vast
    // majority of cases, it should be done long before that timeout. We just
    // don't want to stall the loading of the app forever if the user is on slow
    // internet. The information is not actually needed for anything important
    // in the beginning. It's mostly for debugging at this point.
    const oc = new Opencast(settingsManager.settings().opencast);
    await Promise.race([
      oc.refreshConnection(),
      sleep(300),
    ]);

    return [settingsManager, oc] as [SettingsManager, Opencast];
  }),
]);

const render = (body: JSX.Element) => {
  const reactRoot = ReactDOM.createRoot(notNullish(document.getElementById("root")));
  reactRoot.render(body);
};

// After the initialization is done, render to the root element.
initialize.then(
  ([App, hasWebcam, [settingsManager, opencast]]) => {
    render(
      <React.StrictMode>
        <OpencastProvider initial={opencast}>
          <SettingsProvider settingsManager={settingsManager}>
            <StudioStateProvier hasWebcam={hasWebcam}>
              <App />
            </StudioStateProvier>
          </SettingsProvider>
        </OpencastProvider>
      </React.StrictMode>,
    );
  },

  // This error case is very unlikely to occur.
  e => render(<p>
    {`Fatal error while loading app: ${e.message}`}
    <br />
    This might be caused by a incorrect configuration by the system administrator.
  </p>),
);
