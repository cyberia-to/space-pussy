import React from "react"
import Display from "../xp/containerGradient/Display/Display"
import * as styles from "./DisplaySmall.module.scss"

function DisplaySmall({ title, content }) {
  return (
    <Display color="purple" noPadding>
      <div className={styles.wrapper}>
        <h6>{title}</h6>
        <p>{content}</p>
      </div>
    </Display>
  )
}

export default DisplaySmall
