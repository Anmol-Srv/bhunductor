/**
 * Wrap an IPC handler with standard try-catch error formatting.
 *
 * @param {string} serviceName - Logging prefix (e.g. 'FolderService')
 * @param {Function} fn - Handler function (event, ...args) => result
 * @returns {Function} Wrapped handler that catches errors and returns { success: false, error }
 */
function wrapHandler(serviceName, fn) {
  return async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (error) {
      console.error(`[${serviceName}] Error:`, error);
      return { success: false, error: error.message };
    }
  };
}

module.exports = { wrapHandler };
