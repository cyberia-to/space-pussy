// import { Pane, Text } from '@cybercongress/gravity';

// const noitem = require('../../image/noitem.svg');
import React from "react"

function Img({ img }) {
  return <img style={{ width: "45px", height: "45px" }} src={img} alt="img" />
}

function NoItems({ text }) {
  return (
    // <Pane
    //   display="flex"
    //   paddingY={40}
    //   alignItems="center"
    //   flexDirection="column"
    //   textTransform="lowercase"
    // >
    //   <Img img={noitem} />
    //   <Text fontSize="18px" color="#fff">
    //     {text}
    //   </Text>
    // </Pane>
    <div>no items</div>
  )
}

export default NoItems
