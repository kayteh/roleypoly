// flow-typed signature: d2dd6b4e6831834e8554fcd055fcf1ab
// flow-typed version: <<STUB>>/chokidar_v2.1.2/flow_v0.95.1

/**
 * This is an autogenerated libdef stub for:
 *
 *   'chokidar'
 *
 * Fill this stub out by replacing all the `any` types.
 *
 * Once filled out, we encourage you to share your work with the
 * community by sending a pull request to:
 * https://github.com/flowtype/flow-typed
 */

declare module 'chokidar' {
  import type { FSWatcher } from 'fs'
  import type EventEmitter from 'events'
  declare type BufferEncoding = "ascii" | "utf8" | "utf16le" | "ucs2" | "base64" | "latin1" | "binary" | "hex"
  declare type Chokidar = {
    watch: (filename: string, options?: { encoding?: BufferEncoding; persistent?: boolean; recursive?: boolean; } | BufferEncoding, listener?: (event: string, filename: string) => void) => EventEmitter
  };

  declare module.exports: Chokidar;
}

/**
 * We include stubs for each file inside this npm package in case you need to
 * require those files directly. Feel free to delete any files that aren't
 * needed.
 */
declare module 'chokidar/lib/fsevents-handler' {
  declare module.exports: any;
}

declare module 'chokidar/lib/nodefs-handler' {
  declare module.exports: any;
}

// Filename aliases
declare module 'chokidar/index' {
  declare module.exports: $Exports<'chokidar'>;
}
declare module 'chokidar/index.js' {
  declare module.exports: $Exports<'chokidar'>;
}
declare module 'chokidar/lib/fsevents-handler.js' {
  declare module.exports: $Exports<'chokidar/lib/fsevents-handler'>;
}
declare module 'chokidar/lib/nodefs-handler.js' {
  declare module.exports: $Exports<'chokidar/lib/nodefs-handler'>;
}
