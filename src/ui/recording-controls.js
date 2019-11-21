//; -*- mode: rjsx;-*-
/** @jsx jsx */
import { jsx } from 'theme-ui';

import { Component } from 'react';
import Modal from 'react-responsive-modal';
import { withTranslation } from 'react-i18next';
import { Beforeunload } from 'react-beforeunload';

import toast from 'cogo-toast';

import downloadBlob from '../download-blob';
import OpencastAPI from '../opencast-api';
import Recorder from '../recorder';

import { PauseButton, RecordButton, ResumeButton, StopButton } from './recording-buttons';
import RecordingState from './recording-state';
import SaveCreationDialog from './save-creation';

const getDownloadName = (deviceType, type, title) => {
  const flavor = deviceType === 'desktop' ? 'Presentation' : 'Presenter';
  return `${flavor} ${type} - ${title || 'Recording'}.webm`;
};

class RecordingControls extends Component {
  constructor(props) {
    super(props);
    this.state = {
      countdown: false,
      recordingState: 'inactive',
      showModal: false,
      desktopRecording: null,
      videoRecording: null
    };

    this.desktopRecorder = null;
    this.videoRecorder = null;

    this.handleDialogClose = this.handleDialogClose.bind(this);
    this.handlePause = this.handlePause.bind(this);
    this.handleResume = this.handleResume.bind(this);
    this.handleSaveCreationSave = this.handleSaveCreationSave.bind(this);
    this.handleSaveCreationUpload = this.handleSaveCreationUpload.bind(this);
    this.handleRecord = this.handleRecord.bind(this);
    this.handleStop = this.handleStop.bind(this);
  }

  hasRecording() {
    return this.state.desktopRecording || this.state.videoRecording;
  }

  hasStreams() {
    return this.props.desktopStream || this.props.videoStream;
  }

  record() {
    const streams = ['desktop', 'video'];

    streams.forEach(deviceType => {
      const recorder = `${deviceType}Recorder`;
      const stream = this.props[`${deviceType}Stream`];

      if (!stream) {
        return;
      }

      this[recorder] = new Recorder(stream);

      this[recorder].on('record.complete', () => {
        this[recorder] = null;
      });

      this[recorder].on('record.complete', ({ media, url }) => {
        this.setState({ [`${deviceType}Recording`]: { deviceType, media, url } });
      });

      this[recorder].start();
    });
  }

  resume() {
    const streams = ['desktop', 'video'];

    streams.forEach(deviceType => {
      const recorder = `${deviceType}Recorder`;
      this[recorder] && this[recorder].resume();
    });
  }

  pause() {
    this.desktopRecorder && this.desktopRecorder.pause();
    this.videoRecorder && this.videoRecorder.pause();
  }

  stop() {
    const streams = ['desktop', 'video'];

    streams.forEach(type => {
      if (this[`${type}Recorder`]) {
        this[`${type}Recorder`].stop();
        this.props[`${type}Stream`].getTracks().forEach(track => track.stop());
      }
    });

    this.setState({ showModal: true });
  }

  handlePause() {
    this.setState({ recordingState: 'paused' });
    this.pause();
  }

  handleResume() {
    this.setState({ recordingState: 'recording' });
    this.resume();
  }

  handleRecord() {
    if (!this.hasStreams()) {
      return;
    }
    this.setState({ countdown: true });
    setTimeout(() => {
      this.record();
      this.setState({ recordingState: 'recording' });
      this.setState({ countdown: false });
    }, 1000);
  }

  handleStop() {
    this.setState({ recordingState: 'inactive' });
    this.stop();
  }

  handleDialogClose() {
    this.setState({ showModal: false });
    this.resetRecordings();
  }

  handleSaveCreationSave() {
    this.handleDialogClose();
    if (this.state.desktopRecording) {
      downloadBlob(
        this.state.desktopRecording.media,
        getDownloadName('desktop', 'video', this.props.recordingData.title)
      );
    }
    if (this.state.videoRecording) {
      downloadBlob(
        this.state.videoRecording.media,
        getDownloadName('video', 'video', this.props.recordingData.title)
      );
    }
    this.resetRecordings();
  }

  handleSaveCreationUpload() {
    const { t } = this.props;
    const { title, presenter } = this.props.recordingData;

    if (title !== '' && presenter !== '') {
      this.handleDialogClose();
      const { hide } = toast.loading(t('upload-notification'), { hideAfter: 0 });
      new OpencastAPI(this.props.settings).loginAndUpload(
        // recording,
        [this.state.desktopRecording, this.state.videoRecording],

        // onsuccess
        () => {
          hide();
          toast.success(t('message-upload-complete'));
        },

        // onloginfailed
        () => {
          hide();
          toast.error(t('message-login-failed'));
          // TODO: (mel) We have to find a better way to ensure connection to OC
          // this.props.handleOpenUploadSettings();
        },

        // onserverunreachable
        err => {
          hide();
          toast.error(t('message-server-unreachable'));
          console.error('Server unreachable: ', err);
          // TODO: (mel) We have to find a better way to ensure connection to OC
          // this.props.handleOpenUploadSettings();
        },

        // oninetorpermfailed
        err => {
          hide();
          toast.error(t('message-conn-failed'));
          console.error('Inet fail or Missing Permission: ', err);
          // TODO: (mel) We have to find a better way to ensure connection to OC
          // this.props.handleOpenUploadSettings();
        },

        title,
        presenter
      );
    } else {
      toast.info(t('save-creation-form-invalid'));
    }
  }

  resetRecordings() {
    this.desktopRecorder = null;
    this.videoRecorder = null;
    this.setState({ desktopRecording: null, videoRecording: null });
    this.props.setDesktopStream(null);
    this.props.setVideoStream(null);
  }

  render() {
    const { t } = this.props;

    return (
        <div sx={{ m: 0, mt: 2 }}>
        {this.hasRecording() && <Beforeunload onBeforeunload={event => event.preventDefault()} />}

        <div sx={{ textAlign: 'center' }}></div>

        <div className="buttons" sx={{ display: 'flex', alignItems: 'center' }}>
          <div sx={{ flex: 1, textAlign: 'right' }}>
            {this.state.recordingState === 'recording' && (
              <PauseButton
                title={t('pause-button-title')}
                recordingState={this.state.recordingState}
                onClick={this.handlePause}
              />
            )}

            {this.state.recordingState === 'paused' && (
              <ResumeButton
                title={t('resume-button-title')}
                recordingState={this.state.recordingState}
                onClick={this.handleResume}
              />
            )}
          </div>

          <div className="center">
            {this.state.recordingState === 'inactive' ? (
              <RecordButton
                large
                title={t('record-button-title')}
                recordingState={this.state.recordingState}
                onClick={this.handleRecord}
                disabled={!this.hasStreams()}
                countdown={this.state.countdown}
              />
            ) : (
              <StopButton
                large
                title={t('stop-button-title')}
                recordingState={this.state.recordingState}
                onClick={this.handleStop}
              />
            )}
          </div>

          <div sx={{ flex: 1 }}>
            <RecordingState recordingState={this.state.recordingState} />
          </div>
        </div>

        <Modal
          open={this.state.showModal}
          onClose={this.handleDialogClose}
          ariaLabelledBy="save-creation-modal-label"
          closeOnEsc={true}
          closeOnOverlayClick={true}
        >
          <div id="save-creation-modal-label" sx={{ display: 'none' }}>
            {t('save-creation-modal-title')}
          </div>

          <SaveCreationDialog
            desktopRecording={this.state.desktopRecording}
            videoRecording={this.state.videoRecording}
            recordingData={this.props.recordingData}
            setRecordingData={this.props.setRecordingData}
            handleCancel={this.handleDialogClose}
            handleSave={this.handleSaveCreationSave}
            handleUpload={this.handleSaveCreationUpload}
          />
        </Modal>
      </div>
    );
  }
}

export default withTranslation()(RecordingControls);
