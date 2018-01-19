pragma solidity ^0.4.18;
import "./UsingMortal.sol";
import "./UsingCanvasBoundaries.sol";

contract Canvas is usingMortal, usingCanvasBoundaries {
  /* packed to 32 bytes */
	struct Pixel {
    bytes3 color;
    uint72 floor_price; /* max value 4722.366482869645213695 eth */
    address owner;
  }
	
  mapping(uint => Pixel) public pixels;
  
  event PixelSold(uint i, address old_owner, address new_owner, uint price, bytes3 new_color);
  
	function Paint(uint _index, bytes3 _color) public payable {
    paint_pixel(_index, _color, msg.value);
	}
  
  function BatchPaint(uint8 _batch_size, uint[] _index, bytes3[] _color, uint[] _price) public payable {
    int remaining = int(msg.value);
    for(uint8 i = 0; i < _batch_size; i++) {
      paint_pixel(_index[i], _color[i], _price[i]);
      remaining -= int(_price[i]);
      require(remaining >= 0);
    }
  }
  
  function paint_pixel(uint _index, bytes3 _color, uint _price) private {
    require(_price == uint72(_price)); /* who would pay more than 4k eth? */
    check_coordinates(_index);
    Pixel storage pixel = pixels[_index];
    //require(_price > pixel.floor_price);
    pixel.color = _color;
    pixel.floor_price = uint72(_price);
    address old_owner = pixel.owner == address(0) ? owner : pixel.owner; //nuevos pixeles son propiedad mia
    pixel.owner = msg.sender;
    old_owner.transfer(_price);
    PixelSold(_index, old_owner, msg.sender, _price, _color);
	}
}