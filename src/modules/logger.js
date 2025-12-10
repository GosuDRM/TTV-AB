/**
 * TTV AB - Logger Module
 * Styled console output
 * @private
 */
function _log(msg, type = 'info') {
    const s = _C.LOG_STYLES[type] || _C.LOG_STYLES.info;
    console.log('%cTTV AB%c ' + msg, _C.LOG_STYLES.prefix, s);
}
