import React from "react"
import { StrongText } from "../../StrongText/StrongText"
import * as styles from "./Vision.module.scss"
import { MenuIds } from "../../Menu/Menu"

function Vision() {
  return (
    <section className={styles.section} id={MenuIds.vision}>
      <h4>
        vision of <StrongText searchLink>superintelligence</StrongText>
      </h4>

      <img src={require("./structure.png").default} />
    </section>
  )
}

export default Vision
