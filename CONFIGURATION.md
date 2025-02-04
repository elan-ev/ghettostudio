# Configuration

Opencast Studio can be configured in three different ways:

- the user can manually configure certain things on the settings page,
- the server can provide a configuration file (by default, Studio uses
  `settings.toml`, but this can be changed via the query parameter
  `settingsFile`), and
- configuration values can be given via query parameters in the URL.

Settings configured by the user have the lowest priority and are overwritten by
both, the server config (e.g. `settings.toml`) and query parameters. Query
parameters also override settings given in the server config (e.g. `settings.toml`).
Additionally, on the settings page, values that are already preconfigured via
`settings.toml` or a query parameter are hidden from the user.


## Possible configuration values

The following settings are currently understood and respected by Studio. This
code block shows the TOML configuration, but all values, except
`return.allowedDomains`, can be specified as query parameter as well. See
further below for information on that.

```toml
# Configuration for Opencast Studio.
#
# Is loaded by Studio in the beginning. Default path is "settings.toml"
# (relative to current URL), but can be overwritten via the environment variable
# `SETTINGS_PATH` at build time.


[opencast]
# URL of the Opencast server that recordings are uploaded to. Has to include
# `https://`. If this is set to an empty string or '/', Studio uses the domain
# it is deployed on. This mostly makes sense for Studio integrated into
# Opencast. If this value is not defined, the user can specify the server URL
# on the settings page.
#serverUrl = "https://opencast.my-university.net"

# Username of the Opencast user to authenticate as. Specifying this value in
# this configuration file is rarely useful, but it can be used if a proper user
# authentication can't be implemented and you want all Studio users to use the
# same Opencast user. This is not ideal and should be avoided, though.
#
# If this value is undefined and `loginProvided` (see below) is NOT `true`, the
# Studio user can configure the login name on the Studio settings page.
#loginName = "peter"

# Password of the Opencast user to authenticate as. See `loginName` for more
# information on when specifying this value is useful. BE AWARE that a password
# specified in the Studio configuration file is as public as your Studio
# installation: if a user can access Studio, they can access this password. As
# such, specifying a pasword in the config file should be avoided if possible.
#loginPassword = "aligator"

# If this is set to `true`, `loginPassword` and `loginName` are ignored.
# Instead, Studio assumes that the user's browser is already authenticated (via
# cookies) at the Opencast server URL. This pretty much only makes sense if
# studio is deployed on the same domain as the target Opencast server (e.g. at
# `/studio`). Default: false.
#loginProvided = true


[upload]
# The ID of the series which the recording is a part of. When uploading the
# recording, it is automatically associated with that series. This value is
# mostly passed as query parameter; specifying it in the configuration file only
# makes sense if you want all the Studio uploads (that don't specify a series
# otherwise) to be associated with one series.
#seriesId = "979e0a0b-db25-47cd-869a-10daa1b3eb7a"

# The workflow ID used to process the recording.
#workflowId = "studio-upload"

# Defines which ACL to send when uploading the recording. See below for
# more information.
#acl = ...

# Defines a custom DC-Catalog (as a template). See below for more information.
#dcc = """
#<?xml version="1.0" encoding="UTF-8"?>
#<dublincore ...>
#  ...
#</dublincore>
#"""

# Specifies if the title field should be 'hidden', 'optional' or 'required'.
# Changing this basically only makes sense if you also set a custom `dcc`.
# Default: 'required'.
#titleField = 'required'

# Specifies if the presenter field should be 'hidden', 'optional' or 'required'.
# Changing this basically only makes sense if you also set a custom `dcc`.
# Default: 'required'.
#presenterField = 'required'

# Specifies if the series field should be 'hidden', 'optional' or 'required'.
# Default: 'optional'.
#seriesField = 'optional'

# Whether to fill the presenter name in the upload step, and if so, how.
# This is a list of sources for potential presenter names to fill in,
# in order of descending preference. If it is empty, nothing is suggested.
#
# Note that right now there is only one such source. Also, manual changes
# to the presenter form field will be persisted in the users' `localStorage`,
# and that stored value will always be preferred over the other sources.
#
# Possible sources are:
# - `"opencast"`: Get the name from Opencast's `/info/me.json` API,
#   specifically the field `user.name`
#autofillPresenter = []


[recording]
# A list of preferred MIME types used by the media recorder. Studio uses the
# first MIME type in that list for which `MediaRecorder.isTypeSupported` returns
# `true`. If this is not defined, or if none of the specified MIME-types is
# supported or if the browser does not support `isTypeSupported`, then Studio
# lets the browser choose a MIME-type.
#mimes = ["video/mp4", "video/webm"]

# The target video bitrate of the recording in bits per second. Please note that
# specifying this for all users is usually a bad idea, as the video stream and
# situation is different for everyone. The resulting quality also largely
# depends on the browser's encoder.
#videoBitrate = 2000000


[review]
# Disables and hides the cutting tools from the review page when set to `true`.
# By default, this is `false`. It only makes sense to set this to `true` if your
# workflows can't handle the cutting information (SMIL file). The default Studio
# worflow in Opencast 8.4 and newer supports this.
#disableCutting = true


[display]
# Passed as `height: { max: _ }` `MediaStreamConstraint` to `getDisplayMedia`.
# Resolutions larger than that should be scaled down by the browser.
#maxHeight = 720

# Passed as `framerate: { max: _ }` `MediaStreamConstraint` to
# `getDisplayMedia`. Most browsers capture with a maximum of 30 FPS by default
# anyway, so you probably don't need this.
#maxFps = 30


[camera]
# Passed as `height: { max: _ }` `MediaStreamConstraint` to `getUserMedia`.
# Different maximum heights can affect the aspect ratio of the video.
#maxHeight = 480

# Passed as `framerate: { max: _ }` `MediaStreamConstraint` to `getUserMedia`.
# Setting this might lead to some users not being able to share their webcam!
#maxFps = 30

[return]
# If this key is set, a "exit and back" button is shown in the last dialog
# right above the "start a new recording" button. This button links to the
# value of this key. Setting this value is usually done via query parameters, as
# a global configuration often does not make sense. You also probably want to
# set `return.label`. Also see `return.allowedDomains`.
#
# Remember to URL-encode the URL if you set it as query parameter, e.g.
# `https://foo.org/?a=1&b=2` would be `https%3A%2F%2Ffoo.org%2F%3Fa%3D1%26b%3D2`.
# To be precise, Studio uses `URLSearchParams` to retrieve the values of GET
# parameters.
#target = "https://my-lms.me.com/course?id=123"

# Label for the site that `return.target` links to. Usually the name of your
# LMS. The English button label is "Exit and go back to {{return.label}}". This
# value is only used if `return.target` is set!
#label = "Stud.IP"

# A list of domains that are allowed for `return.target` links. The domain on
# which Studio is served is always allowed.
#
# Note: this setting can ONLY be set via `settings.toml` and not via GET
# parameter.
#allowedDomains = ["mylms.myuniversity.de"]
```


**Note**: all data configured via `settings.toml` is as public as your Studio installation. For example, if your students can access your deployed studio app, they can also see the `settings.toml`. This is particularly important if you want to preconfigure an Opencast user.

Please also note that all settings related to video capture or recording should be treated carefully. Setting any of those means that you know more than the user's browser, which is unlikely: the browser has exact information about screen resolution, connected cameras, CPU usage and the like. As such, before setting any of those values for all of your users, make sure to test everything first!


## Specifying settings via query parameters

Query parameters can simply be attached to the Studio URL. Values specified this way overwrite values set by the user or by `settings.toml`. Example URL:

```
https://studio.opencast.org/?opencast.serverUrl=https://develop.opencast.org&upload.workflowId=studio-upload&upload.seriesId=3fe9ea49-a671-4d1e-9669-0c96ff0f8f79
```

Note that each key is a "path" like `opencast.serverUrl`. The first part of that path is the "section" in the TOML file shown above (e.g. `[opencast]`).

You can also put the settings in a TOML file, then encode that as a hex string and pass it with the `config=` query parameter. This might help to avoid problems if URLs (and thus the query parameters) are processed (e.g. by an LMS) in a way that modifies special characters. For example:

- TOML string:
  ```
  [opencast]
  loginProvided = true
  ```
- Encoded as hex string:
  ```
  5b6f70656e636173745d0a6c6f67696e50726f7669646564203d2074727565
  ```
- Pass to Studio:
  ```
  https://studio.opencast.org?config=5b6f70656e636173745d0a6c6f67696e50726f7669646564203d2074727565
  ```

You can encode your TOML as hex string with [this tool](https://onlineutf8tools.com/convert-utf8-to-hexadecimal), for example. Be sure to disable the options "Use Hex Radix Prefix" and "Use Extra Spacing".

Note that if `config=` is specified, all other parameters are ignored!

Finally, you can change the filename from which the server configuration is loaded by using `settingsFile`, e.g.:

```
https://your-opencast.com/studio?settingsFile=foo.toml
```

This file needs to live in the same directory as the `settings.toml` that would
have been loaded otherwise.


## Debugging/Help

To check if your configuration is correctly applied, you can open Studio in your browser and open the developer tools console (via F12). Studio prints the merged settings and the current state of the connection to the Opencast server there.

You can also check the "Network" tab in the browser's dev tools. There you can see where Studio tries to fetch `settings.toml` from and what your server returned.

### Specify custom DC-Catalog

With `upload.dcc` you can set a custom DC-Catalog.
This makes sense if you want to set custom fields or change some metadata behavior when uploading.
It can either be undefined (default, in which case the default DCC is used) or a string.

The string is a [Mustache.js template](https://mustache.github.io/mustache.5.html).
The following variables are passed as "view" (i.e. you can access those in your template):

- `user`: the object returned by `/info/me.json` describing the current user. Guaranteed to be truthy, specifically: not `null`.
- `lti`: the object returned by `/lti` which describes the current LTI session. Might be `null` (e.g. meaning there is no LTI session).
- `title`: the title specified by the user. Is empty string if `upload.titleField` is 'hidden'. Might be empty string if `upload.titleField` is 'optional'.
- `presenter`: the presenter specified by the user. Is empty string if `upload.presenterField` is 'hidden'. Might be empty string if `upload.presenterField` is 'optional'.
- `seriesId`: the series ID as string or `null` if no series ID is specified.
- `now`: the current datetime as ISO string.

By default, this template is used:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<dublincore xmlns="http://www.opencastproject.org/xsd/1.0/dublincore/"
            xmlns:dcterms="http://purl.org/dc/terms/"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <dcterms:created xsi:type="dcterms:W3CDTF">{{ now }}</dcterms:created>
    <dcterms:title>{{ title }}</dcterms:title>
    {{ #presenter }}<dcterms:creator>{{ presenter }}</dcterms:creator>{{ /presenter }}
    {{ #seriesId }}<dcterms:isPartOf>{{ seriesId }}</dcterms:isPartOf>{{ /seriesId }}
    <dcterms:spatial>Opencast Studio</dcterms:spatial>
</dublincore>
```

## Specify ACL

With `upload.acl` you can configure which ACL is sent (as an attachment) to the Opencast server when uploading. Possible values:
- `true`: use the default ACL (this is the default behavior)
- `false`: do not send an ACL when uploading
- An object with string keys and string arrays as values, mapping from roles to list of allowed actions.
- A string containing a valid ACL XML template (note the `"""` multi line string in TOML)

The ACL XML as well as each string in the object is a [Mustache.js template](https://mustache.github.io/mustache.5.html).
Summary of the template format: you can insert variables with `{{ foo }}`.
You can also access subfields like `{{ foo.bar }}` (if `foo` or `bar` is `null`, the expression just evaluates to the empty string).
Conditionals/loops work with the `{{ #foo }} ... {{ /foo }}` syntax:
if `foo` is falsey, the body between both "tags" is not emitted; if `foo` is a list, the body is repeated for each element; if `foo` is truthy, the body is emitted once.
See the Mustache documentation for more information.

The following variables are passed as view:

- `user`: the object returned by `/info/me.json` describing the current user. Guaranteed to be truthy.
- `lti`: the object returned by `/lti` which describes the current LTI session. Might be `null` (e.g. meaning there is no LTI session).
- `roleOAuthUser`: `"ROLE_OAUTH_USER"` if this role is in `user.roles` or `undefined` otherwise.

Please note that the user using Studio (and thus ingesting the recording) has to have write access to it.
Otherwise, processing will fail.

#### Examples

##### The default ACL template

The default ACL template simply gives read and write access to `user.userRole`:

```toml
[upload]
acl = { "{{ user.userRole }}" = ["read", "write"] }
```

Or in alternative TOML syntax:

```toml
[upload]
acl."{{ user.userRole }}" = ["read", "write"]
```

Or as XML template:

<details>

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Policy PolicyId="mediapackage-1"
  RuleCombiningAlgId="urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:permit-overrides"
  Version="2.0"
  xmlns="urn:oasis:names:tc:xacml:2.0:policy:schema:os">
  <Rule RuleId="user_read_Permit" Effect="Permit">
    <Target>
      <Actions>
        <Action>
          <ActionMatch MatchId="urn:oasis:names:tc:xacml:1.0:function:string-equal">
            <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">read</AttributeValue>
            <ActionAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:1.0:action:action-id"
              DataType="http://www.w3.org/2001/XMLSchema#string"/>
          </ActionMatch>
        </Action>
      </Actions>
    </Target>
    <Condition>
      <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:string-is-in">
        <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">{{ user.userRole }}</AttributeValue>
        <SubjectAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:2.0:subject:role"
          DataType="http://www.w3.org/2001/XMLSchema#string"/>
      </Apply>
    </Condition>
  </Rule>
  <Rule RuleId="user_write_Permit" Effect="Permit">
    <Target>
      <Actions>
        <Action>
          <ActionMatch MatchId="urn:oasis:names:tc:xacml:1.0:function:string-equal">
            <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">write</AttributeValue>
            <ActionAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:1.0:action:action-id"
              DataType="http://www.w3.org/2001/XMLSchema#string"/>
          </ActionMatch>
        </Action>
      </Actions>
    </Target>
    <Condition>
      <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:string-is-in">
        <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">{{ user.userRole }}</AttributeValue>
        <SubjectAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:2.0:subject:role"
          DataType="http://www.w3.org/2001/XMLSchema#string"/>
      </Apply>
    </Condition>
  </Rule>
</Policy>
```

</details>

##### Specifying via URL

To specify the ACL via URL parameter, it's likely not feasible to use XML.
You can use the object notation tho, by specifying a JSON object like this:

```
https://studio.opencast.org/?upload.acl={"ROLE_FOO":["read"],"{{user.userRole}}":["read","write"]}
```

Remember to percent encode the whole JSON object!

This is equivalent to the following TOML:

```toml
[upload]
acl.ROLE_FOO = "read"
acl."{{ user.userRole }}" = ["read", "write"]
```


##### Also giving access to LTI instructors

This extends the default template and additionally gives read and write access to the LTI instructors (`{{ lti.context_id }}_Instructor`), *if* the user comes from an LTI session.
Note the use of conditionals `{{ #lti.context_id }} ... {{ /lti.context_id }}`.
If you also want to add read access for learners, just add another `<Rule>` with `{{ lti.context_id }}_Learner`.

<details>

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Policy PolicyId="mediapackage-1"
  RuleCombiningAlgId="urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:permit-overrides"
  Version="2.0"
  xmlns="urn:oasis:names:tc:xacml:2.0:policy:schema:os">
  <Rule RuleId="user_read_Permit" Effect="Permit">
    <Target>
      <Actions>
        <Action>
          <ActionMatch MatchId="urn:oasis:names:tc:xacml:1.0:function:string-equal">
            <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">read</AttributeValue>
            <ActionAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:1.0:action:action-id"
              DataType="http://www.w3.org/2001/XMLSchema#string"/>
          </ActionMatch>
        </Action>
      </Actions>
    </Target>
    <Condition>
      <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:string-is-in">
        <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">{{ user.userRole }}</AttributeValue>
        <SubjectAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:2.0:subject:role"
          DataType="http://www.w3.org/2001/XMLSchema#string"/>
      </Apply>
    </Condition>
  </Rule>
  <Rule RuleId="user_write_Permit" Effect="Permit">
    <Target>
      <Actions>
        <Action>
          <ActionMatch MatchId="urn:oasis:names:tc:xacml:1.0:function:string-equal">
            <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">write</AttributeValue>
            <ActionAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:1.0:action:action-id"
              DataType="http://www.w3.org/2001/XMLSchema#string"/>
          </ActionMatch>
        </Action>
      </Actions>
    </Target>
    <Condition>
      <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:string-is-in">
        <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">{{ user.userRole }}</AttributeValue>
        <SubjectAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:2.0:subject:role"
          DataType="http://www.w3.org/2001/XMLSchema#string"/>
      </Apply>
    </Condition>
  </Rule>
  {{ #lti.context_id }}
  <Rule RuleId="user_read_Permit" Effect="Permit">
    <Target>
      <Actions>
        <Action>
          <ActionMatch MatchId="urn:oasis:names:tc:xacml:1.0:function:string-equal">
            <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">read</AttributeValue>
            <ActionAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:1.0:action:action-id"
              DataType="http://www.w3.org/2001/XMLSchema#string"/>
          </ActionMatch>
        </Action>
      </Actions>
    </Target>
    <Condition>
      <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:string-is-in">
        <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">{{ lti.context_id }}_Instructor</AttributeValue>
        <SubjectAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:2.0:subject:role"
          DataType="http://www.w3.org/2001/XMLSchema#string"/>
      </Apply>
    </Condition>
  </Rule>
  <Rule RuleId="user_write_Permit" Effect="Permit">
    <Target>
      <Actions>
        <Action>
          <ActionMatch MatchId="urn:oasis:names:tc:xacml:1.0:function:string-equal">
            <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">write</AttributeValue>
            <ActionAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:1.0:action:action-id"
              DataType="http://www.w3.org/2001/XMLSchema#string"/>
          </ActionMatch>
        </Action>
      </Actions>
    </Target>
    <Condition>
      <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:string-is-in">
        <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">{{ lti.context_id }}_Instructor</AttributeValue>
        <SubjectAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:2.0:subject:role"
          DataType="http://www.w3.org/2001/XMLSchema#string"/>
      </Apply>
    </Condition>
  </Rule>
  {{ /lti.context_id }}
</Policy>
```

</details>
