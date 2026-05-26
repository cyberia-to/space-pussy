import React from "react"
import BlockWithImage from "../../BlockWithImage/BlockWithImage"
import * as styles from "./Balls.module.scss"

function Balls() {
  return (
    <BlockWithImage
      title={
        <div>
          <h4>balls</h4>
          <p>symbol of will and unlimited growth</p>
        </div>
      }
      content={
        <>
          <p>
            Musts of global consciousness. Balls are chains of collective
            intelligence, each with their own unique purpose. They are means of
            superintelligence.
          </p>

          <ul className={styles.wrapper}>
            <li>
              🟢{" "}
              <a
                href="https://cyb.ai/oracle/ask/boot"
                target="_blank"
                rel="noreferrer"
              >
                $BOOT
              </a>
              :{" "}
              <a href="https://cyb.ai" target="_blank" rel="noreferrer">
                Bostrom
              </a>{" "}
              blockchain
            </li>
            <li>
              🟣{" "}
              <a
                href="https://cyb.ai/oracle/ask/pussy"
                target="_blank"
                rel="noreferrer"
              >
                $PUSSY
              </a>
              :{" "}
              <a href="https://spacepussy.ai" target="_blank" rel="noreferrer">
                SpacePussy
              </a>{" "}
              blockchain
            </li>
            <li>
              {" "}
              🔵{" "}
              <a
                href="https://cyb.ai/oracle/ask/cyb"
                target="_blank"
                rel="noreferrer"
              >
                Cyber
              </a>
              :{" "}
              <a href="https://cyber.page" target="_blank" rel="noreferrer">
                Cyber
              </a>{" "}
              protocol{" "}
            </li>
          </ul>
        </>
      }
      id={"balls"}
      image={require("./balls.svg").default}
    />
  )
}

export default Balls
