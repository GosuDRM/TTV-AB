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
    const text = typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
    const style = _C.LOG_STYLES[type] || _C.LOG_STYLES.info;

    if (type === 'error') {
        console.error('%cTTV AB%c ' + text, _C.LOG_STYLES.prefix, style);
    } else if (type === 'warning') {
        console.warn('%cTTV AB%c ' + text, _C.LOG_STYLES.prefix, style);
    } else {
        console.log('%cTTV AB%c ' + text, _C.LOG_STYLES.prefix, style);
    }
}
