#!/usr/bin/python3

import json
from pathlib import Path
from struct import pack, unpack
import sys
from time import sleep

import watchdog.events as events
from watchdog.observers import Observer

"""
# Protocol

0. The extension connects to the messaging host
   using `browser.runtime.connectNative('watch-dir')`.

1. The extension listens for messages.

2. On startup, the messaging host
   recursively walks the watched tree
   and sends a `created` message
   for every “interesting” file found.

        {'created': {'name': String,
                     'content': String}}

3. After that, the messaging host
   watches for changes in interesting files in the watched tree.

    * If an interesting file is created
      or moved from outside the tree,
      or a boring file is renamed to interesting,
      send a `created` message.

    * If an interesting file is deleted,
      or renamed to boring,
      or moved outside the tree,
      send a `deleted` message.

            {'deleted': {'name': String}}

    * If an interesting file is modified,
      send a `modified` message.

            {'modified': {'name': String,
                          'content': String}}

    * If an interesting file is renamed or moved within the tree
      and stays interesting,
      send a `renamed` message.

            {'renamed': {'old_name': String,
                         'new_name': String}}


# The watched tree

In the initial version,
the watched tree is defined as `~/.local/share/userstyles`
and all its subdirectories.

Rationale against receiving a path from the extension:
extension should not be able to access arbitrary paths.
(Not even though the extension is written by me
and I am the sole user.)

Rationale against a configuration file:
You Ain’t Gonna Need It.
Maybe if I write another extension using the same messaging host.


# Interesting and boring files

A file within the watched directory is defined _interesting_ if:

+ its name without path does not start with a period `.`, AND
+ its extension is `.css`, AND
+ none of its ancestor directories is called `.git`.

All other files are _boring_.

Rationale for the period:
some editors use that for temporary files while saving.

Rationale for checking the extension:
allow renaming to `.css.disabled` to disable.

"""


ROOT = Path.home()/'.local'/'share'/'userstyles'


def send(message):
    encoded = json.dumps(message).encode('utf-8')
    sys.stdout.buffer.write(pack('@I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def interesting(path):
    return (not path.name.startswith('.')
        and path.suffix == '.css'
        and '.git' not in path.parts)


def boring(path):
    return not interesting(path)


def name(path):
    return str(path.relative_to(ROOT).with_suffix(''))


def created(path):
    send({'created': {'name': name(path),
                      'content': path.read_text()}})


def deleted(path):
    send({'deleted': {'name': name(path)}})


def modified(path):
    send({'modified': {'name': name(path),
                       'content': path.read_text()}})


def renamed(old_name, new_name):
    send({'renamed': {'old_name': old_name,
                      'new_name': new_name}})


class Handler(events.FileSystemEventHandler):

    def on_created(self, event):
        if (isinstance(event, events.FileCreatedEvent)
                and interesting(Path(event.src_path))):
            created(Path(event.src_path))

    def on_deleted(self, event):
        if (isinstance(event, events.FileDeletedEvent)
                and interesting(Path(event.src_path))):
            deleted(Path(event.src_path))

    def on_modified(self, event):
        if (isinstance(event, events.FileModifiedEvent)
                and interesting(Path(event.src_path))):
            modified(Path(event.src_path))

    def on_moved(self, event):
        if not isinstance(event, events.FileMovedEvent):
            return
        old_path = Path(event.src_path)
        new_path = Path(event.dest_path)
        if interesting(old_path):
            if interesting(new_path):
                old_name = name(old_path)
                new_name = name(new_path)
                if old_name != new_name:
                    renamed(old_name, new_name)
            else:
                deleted(old_path)
        elif interesting(new_path):
            created(new_path)


def main():
    for style in ROOT.rglob('*.css'):
        if interesting(style):
            created(style)
    observer = Observer()
    handler = Handler()
    observer.schedule(handler, str(ROOT), recursive=True)
    observer.start()
    try:
        while True:
            sleep(1)
    finally:
        observer.stop()
        observer.join()


if __name__ == '__main__':
    sys.exit(main())
