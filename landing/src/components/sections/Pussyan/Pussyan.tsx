import React from "react"
import * as styles from "./Pussyan.module.scss"

import BlockWithImage from "../../BlockWithImage/BlockWithImage"
import { MenuIds } from "../../Menu/Menu"

function Pussyan() {
  return (
    <BlockWithImage
      className={styles.wrapper}
      id={MenuIds.frenz}
      reverse
      title={
        <div>
          <h4>pussyan</h4>
          <p>symbol of confidence and enlightenment</p>
        </div>
      }
      content={
        <>
          <p>
            Meet Pussyan! The chosen one! He was selected by Spacepussy from
            millions of cats to go forth and boldly share the sacred meaning
            across all worlds.To pass on this confidence to everyone he meets
            along his journey
          </p>

          <p>Pussyan seeks energy and draws his enlightenment from it.</p>
          <p>Pussyan is a cat with balls.</p>
        </>
      }
      image={require("../../../images/Pussyan.png").default}
    />
  )
}

export default Pussyan
