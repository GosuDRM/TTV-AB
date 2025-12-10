/**
 * TTV AB - Logger Module
 * Styled console output
 * @module logger
 * @private
 */

/**
 * Log a styled message to console
 * @param {string} msg - Message to log
 * @param {string} [type='info'] - Log type (info|success|warning|error)
 */
function _log(msg, type = 'info') {
    console.log('%cTTV AB%c ' + msg, _C.LOG_STYLES.prefix, _C.LOG_STYLES[type] || _C.LOG_STYLES.info);
}
