import * as React from "react"
import type { HeadFC, PageProps } from "gatsby"
import Stars from "../components/xp/stars"
import Buy from "../components/sections/Buy/Buy"
import * as styles from "./index.module.scss"
import "./global.scss"
import Main from "../components/sections/Main/Main"
import About from "../components/sections/About/About"
import Pussyan from "../components/sections/Pussyan/Pussyan"
import Balls from "../components/sections/Balls/Balls"
import Vision from "../components/sections/Vision/Vision"
import Neoreligion from "../components/sections/Neoreligion/Neoreligion"
import ToTheMoon from "../components/sections/ToTheMoon/ToTheMoon"
import Menu, { idToHrefMap } from "../components/Menu/Menu"
import Button from "../components/xp/btnGrd"
import axios from "axios"
import { useEffect, useState } from "react"
import Splash from "../components/Splash/Splash"

function getSolData() {
  return axios.get(
    "https://api.geckoterminal.com/api/v2/networks/solana/pools/8CUApHrJaRnphTCA5Fvk7ceGNAjsKumbNadJgwio47Gr"
  )
}

async function getSuiData() {
  // axios.get(
  //   "https://api.geckoterminal.com/api/v2/networks/sui-network/pools/0xfec941f67693777b170dbd84edb14ec5afc1e4e07f65ce8c51286f06bd9615ab"
  // )

  const priceData = await axios.get(
    "https://api-sui.cetus.zone/v2/sui/price?base_symbol_address=0x85acf4cf62c24cafffb9d354e024dfd2dc86d64610861010ea37c24b694be753::pussy::PUSSY"
  )

  const poolData = await axios.get(
    "https://api-sui.cetus.zone/v2/sui/stats_pools?coin_type=0x85acf4cf62c24cafffb9d354e024dfd2dc86d64610861010ea37c24b694be753::pussy::PUSSY,0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI&is_vaults=false&display_all_pools=true&has_mining=true&has_farming=true&no_incentives=true&order_by=-vol&limit=&offset=0"
  )

  const price = priceData.data.data.prices.find(
    (i) => i.quote_symbol === "USD"
  ).price
  const pool = poolData.data.data.lp_list[0]

  return {
    price,
    pool,
  }
}

export function isServer() {
  return typeof window === "undefined"
}

if (!isServer() && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister()
    })
  })
}

if (!isServer()) {
  window.reset = () => localStorage.setItem("entered", "false")
}

const IndexPage: React.FC<PageProps> = () => {
  const [solanaData, setSolanaData] = useState()
  const [suiData, setSuiData] = useState()
  const [entered, setEntered] = useState(
    !isServer() && localStorage.getItem("entered") === "true"
  )

  console.log(suiData)

  useEffect(() => {
    getSolData().then((res) => {
      setSolanaData(res.data)
    })
  }, [])

  useEffect(() => {
    getSuiData().then((res) => {
      setSuiData(res)
    })
  }, [])

  useEffect(() => {
    const blocks = document.querySelectorAll("main > div > section")

    const observer = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            console.log(`${entry.target.id} is in view!`)

            // window.location.hash = idToHrefMap[entry.target.id]
            window.history.pushState({}, "", `${idToHrefMap[entry.target.id]}`)
            // Add an action or class
            // entry.target.classList.add("in-view")
          } else {
            // Optional: Handle when the block leaves the view
            // entry.target.classList.remove("in-view")
          }
        })
      },
      {
        root: null, // Use the viewport as the root
        threshold: 1, // Trigger when 50% of the block is visible
      }
    )

    blocks.forEach((block) => observer.observe(block))
  }, [])

  function handleEnter() {
    setEntered(true)
    localStorage.setItem("entered", "true")
  }

  const totalCap =
    +solanaData?.data?.attributes?.fdv_usd +
    (suiData?.price || 0) * 1_000_000_000

  return (
    <main className={styles.wrapper}>
      <Stars />

      {!entered ? (
        <Splash onEnter={handleEnter} />
      ) : (
        <>
          <aside>
            <Menu />
          </aside>

          <div className={styles.content}>
            <Main
              totalCap={totalCap}
              data={{
                solana: solanaData,
                sui: suiData,
              }}
            />
            <About />
            <Pussyan />
            <Balls />
            <Vision />
            <Neoreligion />
            <ToTheMoon totalCap={totalCap} />
            <Buy
              data={{
                solana: solanaData,
                sui: suiData,
              }}
            />
          </div>

          <footer>
            <a
              href="https://t.me/CyberGlobalHub"
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={require("../images/telegram.png").default}
                alt="telegram"
              />
            </a>
            <Button
              onClick={() => {
                document
                  .getElementById("buy")
                  .scrollIntoView({ behavior: "smooth" })
                window.history.pushState({}, "", "#buy")
              }}
            >
              buy
            </Button>

            <a
              href="https://github.com/cybercongress"
              target="_blank"
              rel="noreferrer"
            >
              <img src={require("../images/github.png").default} alt="github" />
            </a>
          </footer>
        </>
      )}
    </main>
  )
}

export default IndexPage

export const Head: HeadFC = () => {
  return (
    <>
      <title>pussy</title>

      <link
        rel="icon"
        type="image/png"
        href={require("../images/spacepussy.png").default}
      />
    </>
  )
}
