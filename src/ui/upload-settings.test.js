//; -*- mode: rjsx;-*-
import React from 'react';
import { act, cleanup, render, waitForElement } from '@testing-library/react';
import OpencastAPI, { mockCheckConnection } from '../opencast-api';
import UploadSettings from './upload-settings';

jest.mock('../opencast-api');

beforeEach(() => {
  OpencastAPI.mockClear();
});
afterEach(cleanup);

it('renders empty form w/o upload settings', () => {
  const { getByText, getByLabelText } = render(<UploadSettings />);

  expect(getByText('upload-settings-modal-header')).toBeInTheDocument();

  expect(getByLabelText('upload-settings-label-server-url')).toBeInTheDocument();
  expect(getByLabelText('upload-settings-label-server-url')).toHaveValue('');

  expect(getByLabelText('upload-settings-label-workflow-id')).toBeInTheDocument();
  expect(getByLabelText('upload-settings-label-workflow-id')).toHaveValue('');

  expect(getByLabelText('upload-settings-label-username')).toBeInTheDocument();
  expect(getByLabelText('upload-settings-label-username')).toHaveValue('');

  expect(getByLabelText('upload-settings-label-password')).toBeInTheDocument();
  expect(getByLabelText('upload-settings-label-password')).toHaveValue('');
});

it('renders error on wrong settings', async () => {
  const settings = {
    serverUrl: 'some',
    workflowId: 'very',
    loginName: 'wrong',
    loginPassword: 'settings'
  };

  const mockUpdate = jest.fn();
  const { getByRole, getByText } = render(
    <UploadSettings uploadSettings={settings} updateUploadSettings={mockUpdate} />
  );

  await act(async () => {
    getByRole('button').click();
  });
  expect(mockCheckConnection).toHaveBeenCalledTimes(1);
  expect(mockUpdate).toHaveBeenCalledTimes(0);

  await waitForElement(() => getByText('upload-settings-validation-error'));
});

it('renders form w/ upload settings', () => {
  const settings = {
    serverUrl: 'https://localhost',
    workflowId: 'any',
    loginName: 'user',
    loginPassword: 'password'
  };

  const { getByText, getByLabelText } = render(<UploadSettings uploadSettings={settings} />);

  expect(getByText('upload-settings-modal-header')).toBeInTheDocument();

  expect(getByLabelText('upload-settings-label-server-url')).toBeInTheDocument();
  expect(getByLabelText('upload-settings-label-server-url')).toHaveValue(settings.serverUrl);

  expect(getByLabelText('upload-settings-label-workflow-id')).toBeInTheDocument();
  expect(getByLabelText('upload-settings-label-workflow-id')).toHaveValue(settings.workflowId);

  expect(getByLabelText('upload-settings-label-username')).toBeInTheDocument();
  expect(getByLabelText('upload-settings-label-username')).toHaveValue(settings.loginName);

  expect(getByLabelText('upload-settings-label-password')).toBeInTheDocument();
  expect(getByLabelText('upload-settings-label-password')).toHaveValue(settings.loginPassword);
});
