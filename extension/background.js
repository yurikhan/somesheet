var port = browser.runtime.connectNative("watch_dir");

/*
# Data format

    {String: {'enabled': Boolean,
              'sections': [{'urls': [String],
                            'urlPrefixes': [String],
                            'domains': [String],
                            'regexps': [String],
                            'code': String},
                           …]},
     …}

The `styles` object keys store style names.
The corresponding values contain style data.

`enabled` will be `true`
unless the style has been disabled via the UI for this session.
Enabled/disabled status is not stored on disk.

Each of the `sections` represents either a @-moz-document rule
or the global rules.

Global rules (if any) will be in a section
whose `urls`, `urlPrefixes`, `domains`, and `regexps`
are all empty.

*/
var styles = {};

var masterEnabled = true;


function logMessage(...args) {
  // console.log(...args);
}

function logApplied(...args) {
  // console.log('applied', ...args)
}

function asyncMap(array, f) {
  return Promise.all(array.map(f));
}

function removeStyle({sections}) {
  return browser.tabs.query({})
  .then(tabs =>
    asyncMap(tabs, tab =>
      asyncMap(sections, ({code}) =>
        browser.tabs.removeCSS(tab.id, {code, allFrames: true}))
      .catch(e => console.log(tab.url, e))));
}

function removeStyleByName(name) {
  if (name in styles) {
    removeStyle(styles[name]);
  }
}

function appliesTo(url) {
  return ({urls, urlPrefixes, domains, regexps}) => {
    var hostname = new URL(url).hostname;
    return url in urls ||
      urlPrefixes.some(prefix => url.startsWith(prefix)) ||
      domains.some(domain =>
        hostname === domain ||
        hostname.endsWith('.' + domain)) ||
      regexps.some(regexp =>
        RegExp(`^(?:${regexp})$`).test(url)) ||
      !urls.length && !urlPrefixes.length &&
      !domains.length && !regexps.length;
  }
}

function applyStyleToFrame({enabled, sections},
                           {tabId, frameId, url},
                           tabUrl) {
  return masterEnabled &&
    enabled &&
    asyncMap(sections.filter(appliesTo(url)), section =>
      browser.tabs.insertCSS(tabId, {code: section.code,
                                     frameId,
                                     matchAboutBlank: true,
                                     runAt: 'document_start'})
      .then(() => logApplied(tabId, tabUrl, frameId, url, section.code)))
    .catch(e => console.log(tabId, tabUrl, frameId, url, e));
}

function applyStylesToFrame(frame, tabUrl) {
  return masterEnabled &&
    asyncMap(Object.values(styles), style =>
      applyStyleToFrame(style, frame, tabUrl));
}

function applyStyleToTabs(style) {
  return masterEnabled &&
    style.enabled &&
    browser.tabs.query({})
    .then(tabs =>
      asyncMap(tabs, tab =>
        !tab.discarded &&
        browser.webNavigation.getAllFrames({tabId: tab.id})
        .then(frames =>
          asyncMap(frames, frame =>
            applyStyleToFrame(style, frame, tab.url)))))
    .catch(e => console.log(e));
}

function applyStylesToTabs() {
  return masterEnabled &&
    asyncMap(Object.values(styles), style =>
      applyStyleToTabs(style))
}

function replaceStyle(name, content) {
  var enabled = !(name in styles) || styles[name].enabled;
  removeStyleByName(name);
  var style = {enabled, sections: splitCSS(content)};
  styles[name] = style;
  applyStyleToTabs(style);
}

function disableStyle(name) {
  if (!(name in styles)) return;
  removeStyleByName(name);
  styles[name].enabled = false;
}

function enableStyle(name) {
  if (!(name in styles)) return;
  styles[name].enabled = true;
  applyStyleToTabs(styles[name]);
}

function disableMaster() {
  asyncMap(Object.keys(styles), removeStyleByName);
  masterEnabled = false;
}

function enableMaster() {
  masterEnabled = true;
  applyStylesToTabs();
}

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

/*
# Protocol

## Frame initialization

0. As soon as a page starts loading in a frame,
   the content script is injected.

1. The content script sends an apply request:

        {'applyStyles': {}}

2. The background script applies the styles
   relevant to the sender’s URL. No response is sent.


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
browser.runtime.onMessage.addListener((message, sender) => {
  console.log('got message', message, 'from', sender);
  if ('applyStyles' in message) {
    return applyStylesToFrame({tabId: sender.tab.id,
                               frameId: sender.frameId,
                               url: sender.url},
                               sender.tab.url);
  } else if ('populate' in message) {
    return browser.tabs.query({active: true, currentWindow: true})
      .then(([tab]) => {
        var applicableStyles = Object.entries(styles)
          .filter(([name, {enabled, sections}]) =>
            sections.some(appliesTo(tab.url)))
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

// The content script has to be registered dynamically
// because if registered via manifest.json
// it will get injected into every existing tab on extension load
// and try to send us messages before we start listening for them,
// which causes annoying connection error messages in the console.
browser.contentScripts.register({
  matches: ["<all_urls>"],
  allFrames: true,
  matchAboutBlank: true,
  runAt: "document_start",
  js: [{file: "content.js"}]
});
