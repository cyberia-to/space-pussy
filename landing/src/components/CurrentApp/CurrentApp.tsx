import * as React from "react"
import * as styles from "./CurrentApp.module.scss"
import { MenuIds } from "../Menu/Menu"

type Props = {
  currentBlock: MenuIds
}

function CurrentApp({ currentBlock }: Props) {
  const standardImage = require("../../images/spacepussy.png").default
  const images = {
    [MenuIds.main]: require("../../images/spacepussy.png").default,
    [MenuIds.spacepussy]: require("../../images/spacepussy.png").default,
    [MenuIds.frenz]: require("../../images/Pussyan.png").default,
    [MenuIds.vision]: require("../sections/Vision/structure.png").default,
    [MenuIds.neoreligion]: require("../sections/Neoreligion/map.png").default,
    [MenuIds.progress]: require("../sections/ToTheMoon/moon.png").default,
    [MenuIds.buy]: require("../sections/Buy/images/buy.svg").default,
    [MenuIds.balls]: require("../../images/Pussyan.png").default,
  }

  return (
    <div className={styles.wrapper}>
      <img
        src={currentBlock ? images[currentBlock] : standardImage}
        alt={currentBlock || "default"}
        className={styles.image}
      />

      <div className={styles.text}>
        {currentBlock ? currentBlock : "pussy.meme"}
      </div>
    </div>
  )
}
export default CurrentApp
