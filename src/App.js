// eslint-disable-next-line
import React, { Component } from 'react'
import CanvasContract from '../build/contracts/Canvas.json'
import getWeb3 from './utils/getWeb3'
import { SketchPicker } from 'react-color'
import {Helmet} from "react-helmet"
import { Col, Grid } from 'react-bootstrap'
import Pixel from './Pixel'
import Footer from './Footer'
import ColorUtils from './utils/ColorUtils'
import ContractToWorld from './utils/ContractToWorld'
import WorldToCanvas from './utils/WorldToCanvas'
import WorldToContract from './utils/WorldToContract'
import CanvasUtils from './utils/CanvasUtils'
import Canvas from './Canvas'
import PixelBatch from './PixelBatch'
import EventLog from './EventLog'
import { PixelSoldEvent, NewPixelEvent } from './CustomEvents'
import KeyListener from './KeyListener'
import BigNumber from 'bignumber.js'
import axios from 'axios'
import AddressBuffer from './AddressBuffer'

import './css/oswald.css'
import './css/open-sans.css'
import './css/pure-min.css'
import './truffle.css'
import './App.css'

class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      viewport_size: {
        width: 800,
        height: 800
      },
      minimap_size: {
        width: 100,
        height: 100
      },
      zoom_size: {
        width: 100,
        height: 100
      },
      canvas_size: {},
      web3: null,
      thresholds: [],
      genesis_block: null,
      current_block: null,
      current_color: { r: 255, g: 255, b: 255, a: 255 },
      batch_paint: [],
      event_logs: [],
      keys_down: {},
      x: 0,
      y: 0
    }
    this.processed_logs = []
    this.bootstrap_steps = 3
    this.bootstraped = 0
    this.max_event_logs_size = 100
    this.max_batch_length = 20
    this.click_timer_in_progress = true
  }

  componentWillMount() {
    // Get network provider and web3 instance.
    // See utils/getWeb3 for more info.

    getWeb3
    .then(results => {
      this.setState({
        web3: results.web3,
        infura: results.infura
      })

      // Instantiate contract once web3 provided.
      this.instantiateContract()
    })
    .catch(() => {
      console.log('Error finding web3.')
    })
  }

  bootstraping() {
    return this.bootstraped < this.bootstrap_steps
  }

  try_bootstrap() {
    this.bootstraped++
    if (this.bootstraping())
      return
    this.current_wheel_zoom = this.whole_canvas_on_viewport_ratio()
    this.point_at_center = { x: this.state.canvas_size.width * 0.5, y: this.state.canvas_size.height * 0.5 }
    let last_cache_index = ContractToWorld.max_index(this.state.genesis_block, this.last_cache_block)
    this.resize_pixel_buffer(this.state.canvas_size, last_cache_index, this.state.max_index)
    this.clear_logs()
    this.start_watching()
    this.update_pixels([])
  }

  load_canvases(latest_block) {
    this.load_cache_image(latest_block)
    this.load_clear_image()
    this.load_addresses_buffer()
  }

  bucket_url(key) {
    return `https://${ process.env.REACT_APP_S3_BUCKET }.s3.us-east-2.amazonaws.com/${key}`
  }

  load_addresses_buffer() {
    axios.get(this.bucket_url('addresses.buf'), { responseType:"arraybuffer" }).then(response => {
      AddressBuffer.decompress_buffer(response.data)
      .then(result => this.address_buffer = new AddressBuffer(result.buffer))
      .catch(error => console.error("Error when inflating cache buffer"))
      .then(this.try_bootstrap.bind(this))
    })
  }

  load_cache_image(latest_block) {
    axios.get(this.bucket_url('init.json')).then(response => {
      if (this.infura_contract_instance.address === response.data.contract_address) {
        this.last_cache_block = response.data.last_cache_block
        let img = new Image()
        img.crossOrigin = ''
        img.src = this.bucket_url('pixels.png')
        img.style.display = 'none'
        img.onload = this.load_buffer_data.bind(this, img, latest_block)
      }
      else {
        this.last_cache_block = this.state.genesis_block - 2
        this.load_buffer_data(null, latest_block)
      }
    })
  }

  load_clear_image() {
    let clear_image = new Image()
    clear_image.src = 'clear_image.png'
    clear_image.style.display = 'none'
    clear_image.onload = () => {
      this.clear_image = clear_image
      this.try_bootstrap()
    }
  }

  load_buffer_data(img, latest_block) {
    let canvas = document.createElement('canvas')
    let new_max_index = ContractToWorld.max_index(this.state.genesis_block, latest_block)
    let dimension = ContractToWorld.canvas_dimension(new_max_index)
    canvas.width = dimension
    canvas.height = dimension
    this.pixel_buffer_ctx = canvas.getContext('2d')
    if (img)
      this.pixel_buffer_ctx.drawImage(img, 0.5 * (dimension - img.width), 0.5 * (dimension - img.height))
    this.init_preview_buffer(dimension)
    this.setState({ current_block: latest_block, max_index: new_max_index, canvas_size: { width: dimension, height: dimension } }, this.try_bootstrap.bind(this))
  }

  init_preview_buffer(dimension) {
    let preview_canvas = document.createElement('canvas')
    preview_canvas.width = dimension
    preview_canvas.height = dimension
    this.preview_buffer_ctx = preview_canvas.getContext('2d')
    CanvasUtils.clear(this.preview_buffer_ctx, 'rgba(0, 0, 0, 0)', preview_canvas)
  }

  redraw(e){
    let destination_top_left = this.destination_top_left()
    let destination_size = this.destination_size()
    this.main_canvas.clear(this.clear_image)
    this.main_canvas.drawImage(this.pixel_buffer_ctx.canvas,
      0, 0,
      this.state.canvas_size.width, this.state.canvas_size.height,
      destination_top_left.x, destination_top_left.y,
      destination_size.x, destination_size.y)
    this.main_canvas.drawImage(this.preview_buffer_ctx.canvas,
      0, 0,
      this.state.canvas_size.width, this.state.canvas_size.height,
      destination_top_left.x, destination_top_left.y,
      destination_size.x, destination_size.y)
    this.update_zoom(e)
    this.outline_hovering_pixel()
  }
  
  update_preview(pixel) {
    let b_coords = WorldToCanvas.to_buffer(pixel.x, pixel.y, this.preview_buffer_ctx.canvas)
    this.preview_buffer_ctx.putImageData(pixel.image_data, b_coords.x, b_coords.y)
    this.redraw()
  }
  
  remove_preview(pixels) {
    pixels.forEach(p => {
      let b_coords = WorldToCanvas.to_buffer(p.x, p.y, this.preview_buffer_ctx.canvas)
      this.preview_buffer_ctx.putImageData(CanvasUtils.transparent_image_data(ImageData), b_coords.x, b_coords.y)
    })
    this.redraw()
  }

  outline_pixel(world_pixel, soft) {
    let viewport_coords = WorldToCanvas.to_viewport(world_pixel, this.state.canvas_size, this.point_at_center, this.current_wheel_zoom, this.state.viewport_size)
    this.main_canvas.outline(viewport_coords.x, viewport_coords.y, this.current_wheel_zoom, this.current_wheel_zoom, soft)
  }

  outline_hovering_pixel() {
    if (this.state.hovering_pixel) {
      this.outline_pixel(this.state.hovering_pixel, true)
    }
  }

  whole_canvas_on_viewport_ratio() {
    return this.state.viewport_size.width / this.state.canvas_size.width
  }

  destination_top_left() {
    return {
      x: this.state.viewport_size.width * 0.5 - this.point_at_center.x * this.current_wheel_zoom,
      y: this.state.viewport_size.height * 0.5 - this.point_at_center.y * this.current_wheel_zoom
    }
  }

  destination_size() {
    /*
    wheel_zoom / result
    1    => 2049
    2    => 4098
    0.5  => -112
    0.39 => 0
    0.25 => 144
    */
    return {
      x: this.current_wheel_zoom * this.state.canvas_size.width,
      y: this.current_wheel_zoom * this.state.canvas_size.height
    }
  }
  
  new_log(log_index, tx_hash) {
    let log_id = `${tx_hash}-${log_index}`
    let new_log = !this.processed_logs.includes(log_id)
    if (new_log)
      this.processed_logs.push(log_id)
    return new_log
  }
  
  pixel_sold_handler(error, result) {
    if (error)
      console.error(error)
    else
      if (result.transactionHash) // event, not log
        result = [result]
      this.process_pixel_solds(result)
  }
  
  start_watching() {
    var pixel_sold_event = this.infura_contract_instance.PixelSold(null, { fromBlock: this.last_cache_block, toBlock: 'latest' })
    pixel_sold_event.watch(this.pixel_sold_handler.bind(this))
    pixel_sold_event.get(this.pixel_sold_handler.bind(this))

    this.state.infura.eth.filter("latest").watch((error, block_hash) => {
      this.state.infura.eth.getBlock(block_hash, (error, result) => {
        if (error)
          console.error(error)
        else
          if (result.number > this.state.current_block)
            this.update_block_number(result.number)
      })
    })
  }
  
  process_pixel_solds(log) {
    var new_pixels = log.reduce((pixel_data, l) => {
      if (this.new_log(l.logIndex, l.transactionHash))
        pixel_data.push(Pixel.from_contract(l.transactionHash, l.args))
      return pixel_data
    }, [])
    if (new_pixels.length)
      this.update_pixels(new_pixels)
  }
  
  update_pixels(new_pixels) {
    for(var i = 0; i < new_pixels.length; i++) {
      let new_pixel = new_pixels[i]
      new_pixel.old_color = this.color_at(new_pixel.x, new_pixel.y)
      let buffer_coords = WorldToCanvas.to_buffer(new_pixel.x, new_pixel.y, this.state.canvas_size)
      this.pixel_buffer_ctx.putImageData(new_pixel.image_data, buffer_coords.x, buffer_coords.y)
      this.address_buffer.update_pixel(new_pixel)
      this.push_event(new PixelSoldEvent(new_pixel))
    }
    this.redraw()
    this.update_minimap()
  }
  
  push_event(event) {
    this.setState(prev_state => {
      prev_state.event_logs.unshift(event)
      if (prev_state.event_logs.length > this.max_event_logs_size)
        prev_state.event_logs.pop()
      return { event_logs: prev_state.event_logs }
    })
  }

  clear_logs() {
    this.setState({ event_logs: []})
  }

  update_zoom(e) {
    if (!(e || this.current_zoom))
      return
    if (e)
      this.current_zoom = { x: e.layerX, y: e.layerY }
    this.zoom_canvas.drawImage(this.main_canvas.canvas,
                      Math.abs(this.current_zoom.x - 5),
                      Math.abs(this.current_zoom.y - 5),
                      10, 10,
                      0, 0,
                      this.state.zoom_size.width, this.state.zoom_size.height)
  }
  
  main_canvas_mouse_move(e) {
    if (!this.point_at_center)
      return
    this.mouse_position = { x: e.layerX, y: e.layerY }
    if (this.dragging_canvas)
      this.drag(e)
    else
      /* redraw to update_zoom */
      this.redraw(e)
    this.update_hovering_pixel()
  }

  drag(e) {
    this.point_at_center.x = this.point_at_center.x - (this.mouse_position.x - this.drag_start.x) / this.current_wheel_zoom
    this.point_at_center.y = this.point_at_center.y - (this.mouse_position.y - this.drag_start.y) / this.current_wheel_zoom
    this.drag_start = this.mouse_position
    this.redraw(e)
  }

  update_hovering_pixel() {
    let pap = this.pixel_at_pointer()
    this.setState({ hovering_pixel: pap.index <= this.state.max_index ? pap : null })
  }

  pointer_inside_canvas(pixel_at_pointer) {
    return pixel_at_pointer.is_inside_canvas(this.state.max_index)
  }

  pixel_at_pointer() {
    let x = Math.round(this.point_at_center.x - this.state.canvas_size.width / 2 + (this.mouse_position.x - this.state.viewport_size.width * 0.5) / this.current_wheel_zoom)
    let y = - Math.round(this.point_at_center.y - this.state.canvas_size.height / 2 + (this.mouse_position.y - this.state.viewport_size.height * 0.5) / this.current_wheel_zoom)
    let i = new WorldToContract(x, y).get_index()
    let color = this.color_at(x, y)
    let fetch_buffer = i <= this.state.max_index
    return new Pixel(
      x,
      y,
      color,
      fetch_buffer ? this.address_buffer.address_at(i) : null,
      fetch_buffer ? this.address_buffer.price_at(i) : null,
      null,
      i
    )
  }

  main_canvas_mouse_down(e) {
    e.preventDefault()
    this.click_detection_timer = setTimeout(this.mouse_down_held_too_long.bind(this, e), 100)
    this.start_dragging(e)
  }

  start_dragging(e) {
    this.dragging_canvas = true
    this.initial_drag_start = { x: e.layerX, y: e.layerY }
    this.drag_start = this.initial_drag_start
  }

  mouse_down_held_too_long(e) {
    this.click_timer_in_progress = false
  }

  may_be_a_click(e) {
    return this.click_timer_in_progress && this.initial_drag_start.x === e.layerX && this.initial_drag_start.y === e.layerY
  }

  main_canvas_mouse_up(e) {
    e.preventDefault()
    clearTimeout(this.click_detection_timer)
    if (this.may_be_a_click(e)) {
      let pap = this.pixel_at_pointer()
      if (this.pointer_inside_canvas(pap))
        if (e.altKey)
          this.pick_color(pap)
        else
          this.add_to_batch(pap)
    }
    this.stop_dragging(e)
    this.click_timer_in_progress = true
  }

  stop_dragging(e) {
    this.dragging_canvas = false
    this.drag_end = { x: e.layerX, y: e.layerY }
  }

  pick_color(pixel_at_pointer) {
    this.setState({ current_color: pixel_at_pointer.rgba_color() })
  }

  is_picking_color() {
    return this.state.keys_down.alt
  }

  update_minimap() {
    this.minimap_canvas.clear()
    this.minimap_canvas.drawImage(this.pixel_buffer_ctx.canvas,
                      0, 0,
                      this.state.canvas_size.width, this.state.canvas_size.height,
                      0, 0,
                      this.state.minimap_size.width, this.state.minimap_size.height)
  }
  
  update_from_minimap(e) {
    this.point_at_center = {
      x: (e.layerX / this.state.minimap_size.width) * this.state.canvas_size.width,
      y: (e.layerY / this.state.minimap_size.height) * this.state.canvas_size.height
    }
    this.redraw()
  }

  hold_minimap(e) {
    if (e.button === 0)
      this.dragging_minimap = true
  }

  move_on_minimap(e) {
    if (this.dragging_minimap)
      this.update_from_minimap(e)
  }
  
  release_minimap(e) {
    e.preventDefault()
    this.dragging_minimap = false
    this.update_from_minimap(e)
  }

  wheel_zoom(e) {
    e.preventDefault()
    /* Check whether the wheel event is supported. */
    if (e.type === "wheel") this.wheel_even_supported = true
    else if (this.wheel_even_supported) return
    /* Determine the direction of the scroll (< 0 → up, > 0 → down). */
    var delta = ((e.deltaY || -e.wheelDelta || e.detail) >> 10) || 1
    this.current_wheel_zoom = this.current_wheel_zoom * (delta > 0 ? 0.8 : 1.25)
    this.update_hovering_pixel()
    this.redraw()
  }

  update_block_number(block_number) {
    let old_max_index = this.state.max_index
    let new_max_index = ContractToWorld.max_index(this.state.genesis_block, block_number)
    let new_dimension = ContractToWorld.canvas_dimension(new_max_index)
    this.setState({ current_block: block_number, max_index: new_max_index })
    this.resize_pixel_buffer({ width: new_dimension, height: new_dimension }, old_max_index, new_max_index)
  }

  resize_pixel_buffer(new_size, old_max_index, new_max_index) {
    this.preview_buffer_ctx = CanvasUtils.resize_canvas(
      this.preview_buffer_ctx,
      document.createElement('canvas'),
      new_size,
      old_max_index,
      new_max_index,
      CanvasUtils.transparent_image_data(ImageData)
    )
    CanvasUtils.resize_canvas(
      this.pixel_buffer_ctx,
      document.createElement('canvas'),
      new_size,
      old_max_index,
      new_max_index,
      CanvasUtils.semitrans_image_data(ImageData),
      (new_ctx, new_pixels_world_coords, delta_w, delta_h) => {
        this.pixel_buffer_ctx = new_ctx
        new_pixels_world_coords.forEach(w_coords => this.push_event(new NewPixelEvent(w_coords)))
        this.setState({ canvas_size: new_size }, () => {
          this.point_at_center.x = this.point_at_center.x + delta_w
          this.point_at_center.y = this.point_at_center.y + delta_h
          this.redraw()
          this.update_minimap()
        })
      }
    )
  }

  instantiateContract() {

    /*
     * SMART CONTRACT EXAMPLE
     *
     * Normally these functions would be called in the context of a
     * state management library, but for convenience I've placed them here.
     */

    const contract = require('truffle-contract')
    const canvasContract = contract(CanvasContract)
    canvasContract.setProvider(this.state.web3.currentProvider)
    
    var canvasContract2 = contract(CanvasContract)
    canvasContract2.setProvider(this.state.infura.currentProvider)
    canvasContract2.deployed().then(instance => {
      this.infura_contract_instance = instance
      
      instance.GenesisBlock.call().then(genesis_block => {
        let g_block = genesis_block.toNumber()
        this.state.infura.eth.getBlockNumber((error, b_number) => {
          if (error)
            console.error(error)
          else
            this.setState({ genesis_block: g_block }, () => {
              this.load_canvases(b_number)
            })
        })
      })
    })

    // Get accounts.
    this.state.web3.eth.getAccounts((error, accounts) => {
      canvasContract.deployed().then(instance => {
        this.contract_instance = instance
        this.account = accounts[0]
      })
    })
  }

  color_at(x, y) {
    let buffer_coords = WorldToCanvas.to_buffer(x, y, this.state.canvas_size)
    let color_data = this.pixel_buffer_ctx.getImageData(buffer_coords.x, buffer_coords.y, 1, 1).data
    return ColorUtils.rgbToHex({
      r: color_data[0],
      g: color_data[1],
      b: color_data[2],
      a: 1
    })
  }

  pixel_to_paint(pixel_at_pointer) {
    return pixel_at_pointer.change_color(ColorUtils.rgbToHex(this.state.current_color))
  }

  selected_pixel_in_batch(pixel_at_pointer) {
    pixel_at_pointer = pixel_at_pointer || this.pixel_at_pointer()
    return this.state.batch_paint.findIndex(p => p.x === pixel_at_pointer.x && p.y === pixel_at_pointer.y)
  }

  batch_paint_full(pixel_at_pointer) {
    if (!this.state.batch_paint.length)
      return false
    return this.selected_pixel_in_batch(pixel_at_pointer) === -1 && this.state.batch_paint.length >= this.max_batch_length
  }

  batch_remove(i) {
    let removed_pixel = this.state.batch_paint[i]
    this.remove_preview([removed_pixel])
    this.setState(prev_state => {
      return { batch_paint: prev_state.batch_paint.filter((_, index) => index !== i) }
    })
  }

  paint(e) {
    e.preventDefault()
    let batch_length = this.state.batch_paint.length
    if (batch_length) {
      if (batch_length === 1)
        this.paint_one()
      else
        this.paint_many(batch_length)
      this.clear_batch()
    }
  }

  paint_many(batch_length) {
    let indexes = [], colors = [], prices = []
    let total_price = new BigNumber(0)
    this.state.batch_paint.forEach((pixel, i) => {
      indexes.push(pixel.contract_index())
      colors.push(pixel.bytes3_color())
      prices.push(pixel.price)
      total_price = total_price.add(pixel.price)
    })
    this.contract_instance.BatchPaint(batch_length, indexes, colors, prices, { from: this.account, value: total_price, gas: "1500000" })
    .then(result => this.process_pixel_solds(result.logs))
    .catch(error => console.error(error))
  }

  paint_one() {
    let pixel = this.state.batch_paint[0]
    this.contract_instance.Paint(pixel.contract_index(), pixel.bytes3_color(), { from: this.account, value: pixel.price, gas: "200000" })
    .then(result => this.process_pixel_solds(result.logs))
    .catch(error => console.error(error))
  }

  clear_batch(e) {
    if (e)
      e.preventDefault()
    this.remove_preview(this.state.batch_paint)
    this.setState({ batch_paint: []})
  }

  add_to_batch(pixel_at_pointer) {
    let p = this.pixel_to_paint(pixel_at_pointer)
    if (this.batch_paint_full(pixel_at_pointer))
      return
    this.update_preview(p)
    this.setState(prev_state => {
      let index_to_insert = this.selected_pixel_in_batch(p)
      if (index_to_insert === -1)
        index_to_insert = prev_state.batch_paint.length
      prev_state.batch_paint[index_to_insert] = p
      return { batch_paint: prev_state.batch_paint }
    })
  }
  
  thresholds_fetched() {
    return this.state.thresholds.length
  }
  
  handleColorChangeComplete(new_color) {
    this.setState({ current_color: new_color.rgb })
  }
 
  on_alt_down() {
    this.setState(prev_state => {
      prev_state.keys_down.alt = true
      return { keys_down: prev_state.keys_down }
    })
  }

  on_alt_up() {
    this.setState(prev_state => {
      prev_state.keys_down.alt = false
      return { keys_down: prev_state.keys_down }
    })
  }

  render() {
    let block_info = null
    if (this.state.current_block) {
      block_info = (
        <div>
          <p>Genesis block: {this.state.genesis_block}</p>
          <p>Blocknumber: {this.state.current_block}</p>
          <p>Max index: {this.state.max_index}</p>
        </div>
      )
    }
    else
      block_info = ''
    return (
      <div className="App">
        <Helmet>
          <meta charSet="utf-8" />
          <title>Pavlito clabo un clabito</title>
          <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/latest/css/bootstrap.min.css"></link>
        </Helmet>
        <KeyListener on_alt_down={this.on_alt_down.bind(this)} on_alt_up={this.on_alt_up.bind(this)}>
          <nav className="navbar pure-menu pure-menu-horizontal">
              <a href="#" className="pure-menu-heading pure-menu-link">Truffle Box</a>
          </nav>

          <main>
            <Grid fluid={true}>
                <Col md={3}>
                    <SketchPicker
                      color={ this.state.current_color }
                      onChangeComplete={ this.handleColorChangeComplete.bind(this) }
                    />
                    <p>Tip: you can pick a color from the canvas with Alt + click</p>
                    {block_info}
                    <PixelBatch on_batch_submit={this.paint.bind(this)} on_batch_clear={this.clear_batch.bind(this)} on_batch_remove={this.batch_remove.bind(this)} batch={this.state.batch_paint} is_full_callback={this.batch_paint_full.bind(this)} />
                </Col>
                <Col md={7}>
                  <div className='canvas-container' style={this.state.viewport_size}>
                    <Canvas className='zoom-canvas' aliasing={false} width={this.state.zoom_size.width} height={this.state.zoom_size.height} ref={(c) => this.zoom_canvas = c} />
                    <Canvas className='minimap-canvas' on_mouse_up={this.release_minimap.bind(this)} on_mouse_move={this.move_on_minimap.bind(this)} on_mouse_down={this.hold_minimap.bind(this)} aliasing={false} width={this.state.minimap_size.width} height={this.state.minimap_size.height} ref={(c) => this.minimap_canvas = c} />
                    <Canvas className={`canvas ${ this.is_picking_color() ? 'picking-color' : ''}`} on_mouse_wheel={this.wheel_zoom.bind(this)} on_mouse_down={this.main_canvas_mouse_down.bind(this)} on_mouse_up={this.main_canvas_mouse_up.bind(this)} on_mouse_move={this.main_canvas_mouse_move.bind(this)} minimap_ref={this.minimap_canvas} zoom_ref={this.zoom_canvas} aliasing={false} width={this.state.viewport_size.width} height={this.state.viewport_size.height} ref={(c) => this.main_canvas = c} />
                  </div>
                </Col>
                <Col md={2}>
                  <EventLog event_logs={this.state.event_logs} on_clear={this.clear_logs.bind(this)} />
                </Col>
              <Footer pixel={this.state.hovering_pixel} />
            </Grid>
          </main>
        </KeyListener>
      </div>
    )
  }
}

export default App
