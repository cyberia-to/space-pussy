import React, { useState } from "react"
import * as styles from "./Splash.module.scss"
import { isServer } from "../../pages"

const scaleInitValue = 0.9

const spacePussy = require("./space-pussy.svg").default
const portalPussyEnter = require("./portalPussyEnter.mp3").default

const audioBtnObg = !isServer() && new Audio(portalPussyEnter)

const playAudioClick = () => {
  audioBtnObg.play()
}

function Splash({ onEnter }) {
  const [scale, setScale] = useState(scaleInitValue)

  const onClickSpacePussy = () => {
    setScale(6)
    setTimeout(() => {
      //   navigate('/citizenship');
      onEnter()
      setScale(1)
    }, 2705)
    playAudioClick()
  }

  return (
    <div
      className={styles.wrapper}
      style={{
        position: "fixed",
        zIndex: "3",
        left: "50%",
        marginRight: "-50%",
        transform: `translate(-50%, 40px) scale(${scale})`,
        transition: "all 2.7s cubic-bezier(0.67, 0.01, 0.37, 1.01) 0s",
      }}
    >
      <img style={{ width: "100%" }} src={spacePussy} alt="spacePussy" />
      <button
        type="button"
        onClick={() => onClickSpacePussy()}
        className={styles.buttonSpacePussy}
      >
        <div className={styles.textSpacePussy}>click to enter</div>
        {/* <img
        className={styles.arrowSpacePussy}
        src={rocketSpacePussy}
        alt="arrowSpacePussy"
      /> */}
        {/* <RocketSpacePussy /> */}
      </button>
    </div>
  )
}

export default Splash
