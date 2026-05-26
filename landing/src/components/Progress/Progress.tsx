import React from "react"
import * as styles from "./Progress.module.scss"
import cx from "classnames"

function Progress({ value, max, valueText, maxText, className }) {
  return (
    <div className={cx(styles.wrapper, className)}>
      <progress value={value} max={max} />

      <div className={styles.labels}>
        <label>{valueText}</label>
        <label>{maxText}</label>
      </div>
    </div>
  )
}

export default Progress
