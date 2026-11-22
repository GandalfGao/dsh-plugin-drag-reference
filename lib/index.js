// Host half. A pure UI plugin: the host body exists only so the Loader can mount
// this row; the browser half ships through exports["./client"] and is discovered
// through the package.json `dsh.client` declaration.
//
// Nothing runs here on purpose: no host services, no files, no config.

/** Host plugin body — no host-side behavior for this UI plugin. */
function apply() {}

export { apply }
