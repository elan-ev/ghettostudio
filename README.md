Opencast Studio
===============

[![CI status of master](https://img.shields.io/github/workflow/status/elan-ev/opencast-studio/Build%20&%20test/master)
](https://github.com/elan-ev/opencast-studio/actions?query=branch%3Amaster)
[![MIT license](https://img.shields.io/github/license/elan-ev/opencast-studio)
](https://github.com/elan-ev/opencast-studio/blob/master/LICENSE)

A web-based recording studio for [Opencast](https://opencast.org).

Opencast Studio uses the recording capabilities built into modern browsers to
record audio and video streams. The recording happens completely in the user's
browser: no server is involved in that part. Network access is only needed to
initially load the application and to (optionally) upload the videos to an
Opencast instance.


## Supported Browsers

Opencast Studio uses somewhat new web technologies that are not yet (fully) supported by all browsers.
The following table depicts the current state of browser support (as of May 2022).

|            | Firefox ≥ 68   | Chrome ≥ 77      | Edge ≥ 79        | Safari ≥ 14 |
| ---------- | -------------- | ---------------- | ---------------- | ----------- |
| Windows 11 | ✔              | ✔<sup>1</sup>    | ✔<sup>1</sup>    | -
| Windows 10 | ✔              | ✔<sup>1</sup>    | ✔<sup>1</sup>    | -
| Linux      | ✔              | ✔<sup>1</sup>    | ✔<sup>1</sup>    | -
| macOS      | ✔              | ✔<sup>1</sup>    | ✔<sup>1</sup>    | 🔶<sup>1,2</sup>
| iOS        | ❌<sup>3</sup> | ❌<sup>3</sup>   | ❌<sup>3</sup>   | 🔶<sup>1,4</sup>
| Android    | 🔶<sup>4</sup> | 🔶<sup>1,4</sup> | 🔶<sup>1,4</sup> | -

<sup>1</sup> The videos created in Chrome, Edge and Safari are missing explicit duration information and you cannot seek through them.
See [#517](https://github.com/elan-ev/opencast-studio/issues/517) for more information.

<sup>2</sup> Recording webcam and screen at the same time fails (Studio bug: [#934](https://github.com/elan-ev/opencast-studio/issues/934)). Also: Safari only lets you capture the whole screen, not individual windows.

<sup>3</sup> Non-Safari browser on iOS are severely limited.

<sup>4</sup> Screen share on mobile devices not supported; only webcam recording.


## Usage

There are mainly three ways how to use Opencast Studio.

### Integrated in Opencast

Starting with Opencast 8.2, Opencast Studio is integrated into and shipped with
Opencast itself. If you have an Opencast system already, this is the
easiest solution for you. See [the Opencast documentation about the module
'studio'](https://docs.opencast.org/develop/admin/#modules/studio/) for more
information.

### Standalone Version at [studio.opencast.org](https://studio.opencast.org)

You are free to use the publicly deployed version. However, there are two
caveats.

For one, `studio.opencast.org` is updated fairly regularly with the newest
version and is not tested as thoroughly as the Studio version integrated into
Opencast releases. That means that it might occasionally not work or introduce
backwards incompatible changes (mostly related to settings) at any time.

Additionally, in order to upload to your Opencast server from
`studio.opencast.org`, that server needs to be configured appropriately. In
particular, CORS requests from Studio need to be allowed and return the status
code 200. For nginx, you need to add this to your configuration:

```
add_header Access-Control-Allow-Origin https://studio.opencast.org always;
add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS' always;
add_header Access-Control-Allow-Credentials true always;
add_header Access-Control-Allow-Headers 'Origin,Content-Type,Accept,Authorization' always;

# Always respond with 200 to OPTIONS requests as browsers do not accept
# non-200 responses to CORS preflight requests.
if ($request_method = OPTIONS) {
    # On newer nginx versions, you can optionally send an
    # Access-Control-Max-Age header to reduce the number of requests a browser
    # will send.
    #add_header 'Access-Control-Max-Age' 1728000;
    return 200;
}
```

### Self-hosted standalone version

As Studio is a client-only application, you can simply build it and then serve
the resulting static files.


## Configuration

See [`CONFIGURATION.md`](CONFIGURATION.md).

## Opencast APIs used by Studio

Opencast Studio uses the following APIs:

- `/ingest/*`
- `/info/me.json`

You have to make sure that these APIs are accessible to the user using Studio.
In Opencast ≥8.2, providing a user with `ROLE_STUDIO` should grant a user all necessary rights.
In older versions, you might need to create such a role in the security configuration (e.g. `mh_default_org.xml`) of Opencast.


## Build Instructions

To build Studio yourself, execute these commands:

```sh
% git clone git@github.com:elan-ev/opencast-studio.git
% cd opencast-studio
% npm install
% npm run build
```

This will generate static content you can serve via any web server in `build/`.
That's it.

If you prefer to run a local development server directly, you can use this
instead:

```sh
% npm run start
```

### Additional Build Options

By default, Studio expects to be deployed under the root path of a domain (e.g. https://studio.example.com/) and using a
sub-path would not work (e.g. https://example.com/studio). This can be changed by using a number of build options. You
can apply these options by exporting them as environment variable before starting the build process like this:

```sh
export OPTION=VALUE
npm run build
```

| Option                            | Example            | Description
| --------------------------------- | ------------------ | -----------
| `PUBLIC_URL`                      | `/studio`          | Path from which Studio will be served
| `REACT_APP_SETTINGS_PATH`         | `/mysettings.toml` | Path from which to load the configuration (see `CONFIGURATION.md` for more information)
| `REACT_APP_INCLUDE_LEGAL_NOTICES` | `1`                | Set to `1` to include legal notices and information about ELAN e.V., any other value or having this variable not set will not include them. Unless you are working for ELAN e.V. there is probably no reason for you to use this variable.


## Branches

- `master` is the main development branch and targets the `develop` branch Opencast version (currently Opencast 9). New releases are mainly released from `master`.
- `production` is updates whenever a new release is published and always points to the latest release. This branch is automatically deployed to `studio.opencast.org`.
- `opencast-8` is a maintenance branch that targets Opencast 8. Only bug fixes are backported.
