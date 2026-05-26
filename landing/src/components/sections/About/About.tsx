import React from "react"
import * as styles from "./About.module.scss"
import BlockWithImage from "../../BlockWithImage/BlockWithImage"
import { MenuIds } from "../../Menu/Menu"

function About() {
  return (
    <BlockWithImage
      id={MenuIds.spacepussy}
      title={
        <div>
          <h4>spacepussy</h4>
          <p>symbol of life and pleasure</p>
        </div>
      }
      content={
        <>
          <p>
            First seen during a superintelligence bootloader launch, Spacepussy
            appeared with no clear reason or origin.
          </p>

          <p>
            It seems she arrived on a mission: to challenge humanity’s cheap,
            vulgar view of the ultimate source of intelligent life and to
            promote pleasure as the true driver of civilization’s progress.
          </p>

          <p>
            Spacepussy materialized as a chain of collective intelligence at a
            hackathon in Medellín, Colombia, guided by her prophets’ vision to
            celebrate life’s core symbol.
          </p>
        </>
      }
      image={require("../../../images/spacepussy.png").default}
    />
  )
}

export default About
