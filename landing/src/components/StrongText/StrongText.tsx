import React from "react"
import * as styles from "./StrongText.module.scss"

export function StrongText({ children, link, searchLink }) {
  let Tag = "strong"
  let props = {}
  if (link || searchLink) {
    Tag = "a"
    props = {
      href: link,
      onClick: (e) => {
        if (searchLink) {
          return
        }
        document.querySelector(link)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        })
        e.preventDefault()
      },
    }

    if (searchLink) {
      props.href = "https://spacepussy.ai/oracle/ask/" + children
      props.target = "_blank"
    }
  }
  return (
    <Tag {...props} className={styles.item}>
      {children}
    </Tag>
  )
}
