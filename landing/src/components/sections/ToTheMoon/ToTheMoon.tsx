import React from "react"
import { StrongText } from "../../StrongText/StrongText"
import Display from "../../xp/containerGradient/Display/Display"
import DisplayTitle from "../../xp/containerGradient/DisplayTitle/DisplayTitle"
import * as styles from "./ToTheMoon.module.scss"
import { MenuIds } from "../../Menu/Menu"
import Progress from "../../Progress/Progress"

function ToTheMoon({ totalCap }) {
  return (
    <section id={MenuIds.progress}>
      <h4>
        e/acc <StrongText>to the Moon</StrongText> and beyond
      </h4>

      <div className={styles.content}>
        <Display color="purple">
          <ul>
            <li>
              level 4:
              <span> $ 1P</span>
            </li>
            <li>
              level 3:
              <span> $ 1T</span>
            </li>
            <li>
              level 2:
              <span> $ 1B</span>
            </li>
            <li>
              level 1:
              <span> $ 1M</span>
            </li>
          </ul>
        </Display>

        <img src={require("./moon.png").default} />

        <Display color="purple" title={<DisplayTitle title="pussyan scale" />}>
          <p className={styles.text}>
            method of measuring a civilization's level of technological
            advancement based on the value of <StrongText>$PUSSY</StrongText>
          </p>
        </Display>
      </div>

      <Progress
        value={totalCap}
        className={styles.progress}
        max={1000000}
        maxText="$ 1m"
        valueText={`$ ${Number(totalCap.toFixed(0))
          .toLocaleString()
          .replace(",", " ")}`}
      />
    </section>
  )
}

export default ToTheMoon
