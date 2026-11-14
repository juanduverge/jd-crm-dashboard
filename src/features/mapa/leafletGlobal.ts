import L from 'leaflet'

/**
 * `leaflet.heat` es un plugin de los de antes: se cuelga de un `L` GLOBAL.
 * Este módulo existe solo para publicar ese global ANTES de que se evalúe el
 * plugin (los imports se evalúan en orden), y no debe llevar nada más.
 */
;(window as unknown as { L: typeof L }).L = L

export default L
