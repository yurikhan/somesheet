# Somesheet

A simple userstyle WebExtension for Firefox


# What it does

* Load all `*.css` files in a directory tree
* Apply them to existing and newly opened tabs
* Watch for changes in the files and re-apply as necessary

It is a bit like Stylish, Stylus, and xStyle.


# What it does not

* Provide an in-browser editor for styles.
  Since styles are loaded from plain files,
  you can edit them with your favorite editor.
* Provide any support for installing and updating
  styles written by other people and published on a site.
* Provide any means of synchronization of your styles
  between your devices.
  (Well, other extensions do not do this either.)
  However, because styles are stored as plain files,
  you can use Git or any cloud storage to sync them.


# What it needs to work

* Firefox 57 or later.
* Python 3.5 or later.
* The `watchdog` Python library
  (available in Ubuntu as `python3-watchdog` package).


# How it works

WebExtensions do not normally have access to the file system.
So Somesheet uses native messaging to talk to a Python program
that watches for the changes in the files.

The provided program only allows the extension to read `*.css`
files under the directory `~/.local/share/userstyles`
and all its subdirectories.
It does not let the extension to write any files.
In fact, after being started,
it does not accept any requests from the extension.


# How to install

* Besides installing the Firefox extension,
  you’ll need also to install the native messaging host:
  * Copy `messaging-host/watch-dir.py` somewhere on your computer.
  * **Review its code carefully.**
    A native messaging host runs with your full user privileges
    and could in theory access any files you can.
    Do not install any native messaging hosts
    unless you or someone you trust has reviewed them.
  * Put the file `messaging-host/watch_dir.json`
    into your `~/.mozilla/native-messaging-hosts` directory.
    In its `path` key,
    specify the full path to the `watch-dir.py` file.


# What about Windows?

I don’t know!

You will need to be able to run `*.py` scripts as programs
(which is achieved by registering a file association
and adding the `.py` extension to the `PATHEXT` environment variable).

You will also need to modify the path to the userstyle directory
in `watch-dir.py`.

You will have to install the `watchdog` Python library
and make it available to your Python installation.


# What about Chromepatibility and interOperability?

In order to be able to re-apply styles to pages
when they are modified on disk,
Somesheet needs the `browser.tabs.removeCSS` API method.
This is currently only implemented in Firefox.
See Chrome [issue 608854].

[issue 608854]: https://bugs.chromium.org/p/chromium/issues/detail?id=608854

Without that, styles will not be updated correctly in existing tabs.
Refreshing the tab should fix things, though.


# Why was Somesheet created?

I used to use Firefox with Stylish and Stylish Sync.
Then Firefox 57 happened and broke my long-established workflow.
None of the available extensions satisfied all of my needs:

* Let me maintain my own styles
  without publishing them to userstyles.org
* Sync my styles between my devices
  OR make it ridiculously easy for me to do on my own
  (no, going through Export → copy to remote machine → Import
  is insufficiently ridiculously easy)
* Apply my styles in a way that web pages cannot counter


# Why should I choose it over Stylish, Stylus or xStyle?

Unless your needs are reasonably similar to mine, you should not.
