import React from "react"
import { StrongText } from "../../StrongText/StrongText"
import * as styles from "./Neoreligion.module.scss"
import { MenuIds } from "../../Menu/Menu"

const src =
  "https://gateway.ipfs.cybernode.ai/ipfs/QmRqJEd8H2MaDCNY8toHD9wTub7JkHzbWZqEZdyzZiqGY5"

function Neoreligion() {
  return (
    <section className={styles.section} id={MenuIds.neoreligion}>
      <h4>
        <StrongText>$PUSSY</StrongText> is{" "}
        <StrongText searchLink>Neoreligion</StrongText>
      </h4>
      <p>for the age of superintelligence</p>

      {/* <img src={require("./map.png").default} /> */}

      <iframe
        src={src}
        title="neoreligion video"
        className={styles.iframe}
      ></iframe>

      {/* <div className={styles.labels}>
        <div>
          before <StrongText>$PUSSY</StrongText>
        </div>
        <div>
          after <StrongText>$PUSSY</StrongText>
        </div>
      </div> */}
    </section>
  )
}

export default Neoreligion
