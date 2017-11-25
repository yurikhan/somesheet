var port = browser.runtime.connectNative("watch_dir");

/*
# Data format

    {String: {'content': String,
              'enabled': Boolean,
              'conditions': [[keyword String,
                              param String], …]}}

The `styles` object keys store style names.
The corresponding values contain style data.

The `content` property is the style’s CSS source.

`enabled` will be `true`
unless the style has been disabled via the UI for this session.
Enabled/disabled status is not stored on disk.

`conditions` is a cache of @-moz-document rule conditions,
to determine quickly which styles apply to a given URL.
It will be an array of 0..* elements.
Each element will be an array
whose first element is a string
('url', 'url-prefix', 'domain', 'regexp' or '*').
For the former four, the second element shall be a string;
for the latter, the second element is `null` and ignored.

For a global style (one which contains at least one top-level rule
that is not a @-moz-document rule),
this will be [['*', null]].

*/
var styles = {};

var masterEnabled = true;


function logMessage(message) {
  // console.log(message);
}

function logApplied(url, content) {
  // console.log(url, 'applied', content)
}

function asyncMap(array, f) {
  return Promise.all(array.map(f));
}

function removeStyle(content) {
  return browser.tabs.query({})
  .then(tabs =>
    asyncMap(tabs, tab =>
      browser.tabs.removeCSS(tab.id, {code: content})
      .catch(e => console.log(tab.url, e))));
}

function removeStyleByName(name) {
  if (name in styles) {
    removeStyle(styles[name].content);
  }
}

function appliesTo(url) { return ([condition, param]) => {
  switch (condition) {
  case 'url': return url === param;
  case 'url-prefix': return url.startsWith(param);
  case 'domain':
    var hostname = new URL(url).hostname;
    return hostname === param || hostname.endsWith('.' + param);
  case 'regexp':
    return RegExp(`^(?:${param})$`).test(url);
  case '*':
    return true;
  }
}}

function applyStyle({content, conditions, enabled}, tab) {
  return masterEnabled && enabled && conditions.some(appliesTo(tab.url))
    ? browser.tabs.insertCSS(
        tab.id, {code: content, runAt: 'document_start'})
      .then(() => logApplied(tab.url, content))
      .catch(e => console.log(tab.url, e))
    : undefined;
}

function insertStyle(style) {
  browser.tabs.query({})
  .then(tabs =>
    asyncMap(tabs, tab =>
      applyStyle(style, tab)))
  .catch(e => console.log(e));
}

function parseStyle(content) {
  var doc = document.implementation.createHTMLDocument('');
  var style = doc.createElement('style');
  style.textContent = content;
  doc.head.appendChild(style);
  return style.sheet;
}

function conditions(content) {
  var result = [];
  var rules = parseStyle(content).cssRules;
  for (var i = 0; i < rules.length; ++i) {
    if (rules[i] instanceof CSSMozDocumentRule) {
      result.push(...
        rules[i].conditionText.split(/,\s*/)
        .map(condition =>
          condition.match(
            /(url|url-prefix|domain|regexp)\("([^\x22]*)"\)/)
          .slice(1)));
    } else {
      return [['*', null]];
    }
  }
  return result;
}

function replaceStyle(name, content) {
  var enabled = !(name in styles) || styles[name].enabled;
  removeStyleByName(name);
  var style = {content, conditions: conditions(content), enabled};
  styles[name] = style;
  insertStyle(style);
}

function applyStylesTo(tab) {
  return asyncMap(Object.values(styles), style =>
    applyStyle(style, tab))
}

function disableStyle(name) {
  if (!(name in styles)) return;
  removeStyleByName(name);
  styles[name].enabled = false;
}

function enableStyle(name) {
  if (!(name in styles)) return;
  styles[name].enabled = true;
  insertStyle(styles[name]);
}

function disableMaster() {
  asyncMap(Object.keys(styles), removeStyleByName);
  masterEnabled = false;
}

function enableMaster() {
  masterEnabled = true;
  asyncMap(Object.values(styles), insertStyle)
}

/*
Listen for messages from the app.
*/
port.onMessage.addListener(message => {
  logMessage(message);
  if ('created' in message) {
    replaceStyle(message.created.name, message.created.content)
  } else if ('modified' in message) {
    replaceStyle(message.modified.name, message.modified.content)
  } else if ('deleted' in message) {
    removeStyleByName(message.deleted.name);
    delete styles[message.deleted.name];
  } else if ('renamed' in message) {
    styles[message.renamed.new_name] = styles[message.renamed.old_name];
    delete styles[message.renamed.old_name];
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    applyStylesTo(tab)
    .catch(e => console.log(changeInfo.url, e));
  }
});

/*
# Protocol

## Popup initialization

0. Browser action popup page sends a populate request:

        {'populate': {}}

1. Background page responds with the master enable/disable status
   and the names of styles
   which are applicable to the URI of the current tab,
   and their enabled/disabled statuses:

        {'masterEnabled': Boolean,
         'styles': [{'name': String, 'enabled': Boolean}, …]}


## Enabling and disabling the master switch

The extension has a master enable/disable toggle.
When enabled,
styles are applied according to their individual enable status
and their @-moz-document conditions.
When disabled,
no styles are applied
(but individual enable status of each style is retained).

To enable or disable the master switch,
the popup sends:

    {'enableMaster': Boolean}


## Enabling and disabling styles

To enable or disable a style, the popup sends:

    {'enableStyle': {'name': String, 'enabled': Boolean}}
*/
browser.runtime.onMessage.addListener(message => {
  if ('populate' in message) {
    return browser.tabs.query({active: true, currentWindow: true})
      .then(([tab]) => {
        var applicableStyles = Object.entries(styles)
          .filter(([name, {conditions, enabled}]) =>
            conditions.some(appliesTo(tab.url)))
          .map(([name, {enabled}]) => ({name, enabled}));
        applicableStyles.sort((a, b) =>
          a.name < b.name ? -1 :
          a.name > b.name ? 1 : 0);
        return {masterEnabled, styles: applicableStyles};
      })
      .catch(e => console.log(e))
  } else if ('enableStyle' in message) {
    (message.enableStyle.enabled ?
     enableStyle : disableStyle)(message.enableStyle.name);
  } else if ('enableMaster' in message) {
    (message.enableMaster ? enableMaster : disableMaster)();
  }
});
