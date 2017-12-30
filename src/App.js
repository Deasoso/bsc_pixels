import React, { Component } from 'react'
import CanvasContract from '../build/contracts/Canvas.json'
import getWeb3 from './utils/getWeb3'

import './css/oswald.css'
import './css/open-sans.css'
import './css/pure-min.css'
import './App.css'

class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      pixels: null,
      web3: null,
	  limit: null
    }
  }

  componentWillMount() {
    // Get network provider and web3 instance.
    // See utils/getWeb3 for more info.

    getWeb3
    .then(results => {
      this.setState({
        web3: results.web3
      })

      // Instantiate contract once web3 provided.
      this.instantiateContract()
    })
    .catch(() => {
      console.log('Error finding web3.')
    })
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

    // Declaring this for later so we can chain functions on SimpleStorage.
    var contractInstance

    // Get accounts.
    this.state.web3.eth.getAccounts((error, accounts) => {
      canvasContract.deployed().then((instance) => {
        contractInstance = instance

		var event = contractInstance.CurrentBoundary((error, result) => {
			alert(error);
		  if (!error)
			console.log(result)
		this.setState({ limit: result.c[0] })
		})
		
		//this.state.web3.eth.estimateGas({from: accounts[0], to: contractInstance.address, amount: this.state.web3.toWei(1, "ether")}, (result) => { console.log(result)}) TODO VER ESTIMACION DE PAINT Y DEMAS
		
        // Stores a given value, 5 by default.
        return contractInstance.Paint("0", "0", [0xffffff, 0xff0000, 0x00ff00, 0x0000ff, 0x000000], this.state.web3.fromAscii('pablo'), { from: accounts[0], value: "10000000", gas: "2000000" })
      })
    })
  }

  render() {
    return (
      <div className="App">
        <nav className="navbar pure-menu pure-menu-horizontal">
            <a href="#" className="pure-menu-heading pure-menu-link">Truffle Box</a>
        </nav>

        <main className="container">
          <div className="pure-g">
            <div className="pure-u-1-1">
              <h1>Good to Go!</h1>
              <p>Your Truffle Box is installed and ready.</p>
              <h2>Smart Contract Example</h2>
              <p>If your contracts compiled and migrated successfully, below will show a stored value of 5 (by default).</p>
              <p>Try changing the value stored on <strong>line 59</strong> of App.js.</p>
              <p>The stored value is: {this.state.limit}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }
}

export default App
