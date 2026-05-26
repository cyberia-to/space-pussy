import React, { useEffect, useState } from "react"
import * as styles from "./Menu.module.scss"
import { log } from "node:console"
import { isServer } from "../../pages"
import CurrentApp from "../CurrentApp/CurrentApp"

export enum MenuIds {
  main = "main",
  spacepussy = "spacepussy",
  frenz = "frenz",
  vision = "vision",
  neoreligion = "neoreligion",
  progress = "progress",
  buy = "buy",
  balls = "balls",
}

export const idToHrefMap = {
  [MenuIds.main]: "#",
  [MenuIds.spacepussy]: "#spacepussy",
  [MenuIds.frenz]: "#frenz",
  [MenuIds.vision]: "#vision",
  [MenuIds.neoreligion]: "#neoreligion",
  [MenuIds.progress]: "#progress",
  [MenuIds.buy]: "#buy",
  [MenuIds.balls]: "#balls",
}

// Extend history methods

if (!isServer()) {
  ;(function () {
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState

    // Override pushState
    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args)
      window.dispatchEvent(
        new CustomEvent("statechange", { detail: { type: "pushState", args } })
      )
      return result
    }

    // Override replaceState
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args)
      window.dispatchEvent(
        new CustomEvent("statechange", {
          detail: { type: "replaceState", args },
        })
      )
      return result
    }
  })()
}

const links = [
  {
    label: "$PUSSY",
    href: "#",
    icon: require("../../images/spacepussy.svg").default,
  },
  {
    label: "spacepussy",
    href: "#spacepussy",
    icon: require("../../images/spacepussy.svg").default,
  },

  {
    label: "frenz",
    href: "#frenz",
    icon: "👾",
  },
  {
    label: "vision",
    href: "#vision",
    icon: "🩻",
  },
  {
    label: "neoreligion",
    href: "#neoreligion",
    icon: "🎊",
  },
  {
    label: "progress",
    href: "#progress",
    icon: "📈",
  },
  {
    label: "buy",
    href: "#buy",
    icon: "🗿",
  },
]

function Menu() {
  const [currentBlock, setCurrentBlock] = useState(MenuIds.main)

  useEffect(() => {
    function onChange() {
      // debugger
      setCurrentBlock(window.location.hash.slice(1) as MenuIds)
    }

    window.addEventListener("statechange", onChange)

    return () => {
      window.removeEventListener("statechange", onChange)
    }
  }, [])

  console.log(currentBlock)

  return (
    <>
      <CurrentApp currentBlock={currentBlock} />
      <nav className={styles.wrapper}>
        <ul>
          {links.map((link) => {
            const isImg = link.icon.length > 3
            return (
              <li key={link.label}>
                <a
                  href={link.href}
                  className={
                    currentBlock === link.href.slice(1) ? styles.active : ""
                  }
                  onClick={(e) => {
                    if (link.href === "#") {
                      e.preventDefault()
                      window.scrollTo({ top: 0, behavior: "smooth" })
                      // window.history.pushState({}, "", link.href)
                      // window.location.hash = link.href
                      return
                    }

                    const el = document.getElementById(link.href.slice(1))
                    if (el) {
                      e.preventDefault()
                      el.scrollIntoView({ behavior: "smooth", block: "center" })
                      // window.location.hash = link.href
                      // window.history.pushState({}, "", link.href)
                    }
                  }}
                >
                  {isImg ? (
                    <img src={link.icon} alt={link.label} />
                  ) : (
                    <span>{link.icon}</span>
                  )}

                  <span>{link.label}</span>
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}

export default Menu
