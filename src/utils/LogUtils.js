var LogUtils = (() => {
  var to_sorted_event = (sorted, log) => {
    sorted[log.transactionHash] = sorted[log.transactionHash] || {
      tx: log.transactionHash,
      owner: log.args.new_owner,
      locked_until: log.args.locked_until.toNumber(),
      pixels: []
    }
    sorted[log.transactionHash].pixels.push({
      i: log.args.i.toNumber(),
      color: log.args.new_color
    })
  }
  
  var mined_tx_index = (pending_txs, tx_info) => {
    let indexes = tx_info.pixels.map(p => p.i)
    /* find the tx that was sent referencing the same pixels than the one given */
    return pending_txs.findIndex(pending_tx => indexes.length === pending_tx.pixels.length && indexes.every(i => pending_tx.pixels.find(p => p.index === i)))
  }

  var matching_tx_with_gas_index = (pending_txs, tx_info) => {
    return pending_txs.findIndex(pending_tx => pending_tx.gas === tx_info.gas)
  }
  
  return {
    to_sorted_event: to_sorted_event,
    mined_tx_index: mined_tx_index,
    matching_tx_with_gas_index: matching_tx_with_gas_index
  }
})()

export default LogUtils