//; -*- mode: rjsx;-*-
/** @jsx jsx */
import { jsx } from 'theme-ui';
import React from 'react';
import { useTranslation } from 'react-i18next';

import Notification from './notification';
import OpencastAPI from '../opencast-api';
import {
  onSafari,
  isRecordingSupported,
} from "../util";

// Conditionally shows a number of warnings to help the user identify problems.
const Warnings = ({ settings }) => {
  const { t } = useTranslation();

  // We allow HTTP connections to localhost, as most browsers also seem to allow
  // video capture in those cases.
  const usingUnsecureConnection = window.location.protocol !== 'https:' &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  const opencastConfigured = OpencastAPI.areSettingsComplete(settings.opencast);

  return (
    <div sx={{ p: 3 }}>
      {!isRecordingSupported() && (
        <Notification isDanger>
          {t('warning-recorder-not-supported')}
          {onSafari() && ' ' + t('warning-recorder-safari-hint')}
        </Notification>
      )}

      { usingUnsecureConnection && (
        <Notification isDanger>{t('warning-https')}</Notification>
      )}

      { !opencastConfigured && (
        <Notification isDanger>
          {t('warning-missing-connection-settings')}
        </Notification>
      )}
    </div>
  );
};

export default Warnings;
