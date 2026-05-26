import React from "react"
import Display from "../../xp/containerGradient/Display/Display"
import Table from "../../xp/Table/Table"
import * as styles from "./Buy.module.scss"
import { StrongText } from "../../StrongText/StrongText"
import { MenuIds } from "../../Menu/Menu"
import DisplaySmall from "../../DisplaySmall/DisplaySmall"

const icons = {
  dexscreener: "https://dexscreener.com/favicon.ico",
  solscan: "https://solscan.io/favicon.ico",
  birdeye: "https://v2.birdeye.so/favicon.ico",
  rugcheck: "https://rugcheck.xyz/favicon.jpg",
  geckoterminal: "https://www.geckoterminal.com/favicon.ico",
  suivision: "https://suivision.xyz/favicon.ico",
  warp: require("./images/warp.svg").default,
  sui: require("./images/sui.svg").default,
  solana: require("./images/solana.png").default,
  spacepussy: "🟣",
  cetus: "https://app.cetus.zone/favicon.ico",
  raydium: "https://raydium.io/favicon.ico",
  teleport: require("./images/teleport.svg").default,
  gmgn: require("./images/gmgn.png").default,
}

function Buy({ data }) {
  console.log(data)
  return (
    <section id={MenuIds.buy} className={styles.wrapper}>
      <h4>
        In <StrongText>$PUSSY</StrongText> we trust
      </h4>

      <Display noPadding color="purple">
        <Table
          columns={[
            {
              header: "chain",
              cell: (row) => {
                const { chain, url } = row.row.original

                return (
                  <a
                    href={url}
                    className={styles.chain}
                    style={{
                      float: "left",
                    }}
                    target="_blank"
                  >
                    {chain === "spacepussy" ? (
                      <span>{icons[chain]}</span>
                    ) : (
                      <img src={icons[chain]} style={{ width: "16px" }} />
                    )}
                    {/* for css */}
                    <span>{chain}</span>
                  </a>
                )
              },
            },
            {
              header: "research",
              cell: (row) => {
                const { research } = row.row.original
                return (
                  <ul className={styles.research}>
                    {research.map((r) => (
                      <li>
                        <a
                          href={r.url}
                          title={r.name}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            src={icons[r.name]}
                            style={{
                              width: "16px",
                              height: "16px",
                              marginRight: "5px",
                            }}
                          />
                          {/* {r.name} */}
                        </a>
                      </li>
                    ))}
                  </ul>
                )
              },
            },
            {
              header: "supply",
              cell: (row) => {
                if (row.row.original.chain === "spacepussy") {
                  return
                }
                return (
                  row.row.original.emission
                    ?.toLocaleString()
                    .replaceAll(",", " ") + " 🟣"
                )
              },
            },
            {
              header: "price",

              cell: (row) => {
                if (row.row.original.chain === "spacepussy") {
                  return <span className={styles.price}>try to get</span>
                }
                return "$ " + Number(row.row.original.price).toFixed(8)
              },
            },
            {
              header: "24h",
              cell: (row) => {
                if (row.row.original.chain === "spacepussy") {
                  return
                }

                if (row.row.original.chain === "sui") {
                  return "-"
                }

                const isNegative = row.row.original.priceChange < 0
                return (
                  <span
                    style={{
                      color: isNegative ? "#FF1744" : "#00FF00",
                    }}
                  >
                    {isNegative ? "" : "+"}
                    {row.row.original.priceChange}%
                  </span>
                )
              },
            },
            {
              header: "volume",
              cell: (row) => {
                if (row.row.original.chain === "spacepussy") {
                  return
                }

                return "$ " + Number(row.row.original.volume)?.toFixed?.(2)
              },
            },
            {
              header: "cap",
              cell: (row) => {
                if (row.row.original.chain === "spacepussy") {
                  return
                }

                return (
                  "$ " +
                  Number(row.row.original.cap)
                    ?.toLocaleString?.()
                    .replaceAll(",", " ")
                )
              },
            },
            {
              header: "buy",
              cell: (row) => {
                return (
                  <div className={styles.buy}>
                    {row.row.original.buy?.map((b) => (
                      <a href={b.url} target="_blank" rel="noreferrer">
                        <img src={icons[b.name]} style={{ width: "16px" }} />
                      </a>
                    ))}
                  </div>
                )
              },
            },
          ]}
          data={[
            {
              chain: "solana",
              url: "https://raydium.io/swap/?outputMint=5qAWPGkRqb9aV7Yox4gfbJTbm1a9msaswKxyCirwpump&inputMint=sol",
              buy: [
                {
                  name: "gmgn",
                  url: "https://gmgn.ai/sol/token/5qAWPGkRqb9aV7Yox4gfbJTbm1a9msaswKxyCirwpump",
                },
                {
                  name: "raydium",
                  url: "https://raydium.io/swap/?outputMint=5qAWPGkRqb9aV7Yox4gfbJTbm1a9msaswKxyCirwpump&inputMint=sol",
                },
              ],
              emission: 1_000_000_000,
              price: data?.solana?.data?.attributes?.base_token_price_usd,
              priceChange:
                data?.solana?.data?.attributes?.price_change_percentage?.h24,
              volume: data?.solana?.data?.attributes?.volume_usd?.h24,
              cap: data?.solana?.data?.attributes?.fdv_usd,
              research: [
                {
                  name: "dexscreener",
                  url: "https://dexscreener.com/solana/8cuaphrjarnphtca5fvk7cegnajskumbnadjgwio47gr",
                },
                {
                  name: "solscan",
                  url: "https://solscan.io/token/5qAWPGkRqb9aV7Yox4gfbJTbm1a9msaswKxyCirwpump#holders",
                },
                {
                  name: "gmgn",
                  url: "https://gmgn.ai/sol/token/5qAWPGkRqb9aV7Yox4gfbJTbm1a9msaswKxyCirwpump",
                },
                {
                  name: "birdeye",
                  url: "https://v2.birdeye.so/token/5qAWPGkRqb9aV7Yox4gfbJTbm1a9msaswKxyCirwpump?chain=solana",
                },
                {
                  name: "rugcheck",
                  url: "https://rugcheck.xyz/tokens/5qAWPGkRqb9aV7Yox4gfbJTbm1a9msaswKxyCirwpump",
                },
                {
                  name: "geckoterminal",
                  url: "https://www.geckoterminal.com/solana/pools/8CUApHrJaRnphTCA5Fvk7ceGNAjsKumbNadJgwio47Gr",
                },
              ],
            },
            {
              chain: "sui",
              url: "https://app.cetus.zone/swap?from=0x2::sui::SUI&to=0x85acf4cf62c24cafffb9d354e024dfd2dc86d64610861010ea37c24b694be753::pussy::PUSSY",
              emission: 1_000_000_000,
              price: data?.sui?.price,
              priceChange: "-",
              volume: data?.sui?.pool?.vol_in_usd_24h,
              cap: data?.sui?.price * 1_000_000_000,
              buy: [
                {
                  name: "cetus",
                  url: "https://app.cetus.zone/swap?from=0x2::sui::SUI&to=0x85acf4cf62c24cafffb9d354e024dfd2dc86d64610861010ea37c24b694be753::pussy::PUSSY",
                },
              ],

              research: [
                {
                  name: "suivision",
                  url: "https://suivision.xyz/coin/0x85acf4cf62c24cafffb9d354e024dfd2dc86d64610861010ea37c24b694be753::pussy::PUSSY?tab=Holders",
                },
                {
                  name: "cetus",
                  url: "https://app.cetus.zone/liquidity/analytics?poolAddress=0xfec941f67693777b170dbd84edb14ec5afc1e4e07f65ce8c51286f06bd9615ab",
                },
              ],
            },
            {
              chain: "spacepussy",
              url: "https://spacepussy.ai/teleport/swap",
              buy: [
                {
                  name: "teleport",
                  url: "https://spacepussy.ai/teleport/swap",
                },
              ],
              research: [
                {
                  name: "warp",
                  url: "https://spacepussy.ai/warp",
                },
              ],
            },
          ]}
        />
      </Display>
      <br />

      <div className={styles.blocks}>
        {[
          {
            title: "polychain design",
            text: "no need for bridges",
          },
          {
            title: "simple tokenomics",
            text: "all supply in LP. LP burned",
          },
          {
            title: "tech included",
            text: "collective learning in mind",
          },
        ].map((item) => (
          <DisplaySmall title={item.title} content={item.text} />
        ))}
      </div>
    </section>
  )
}

export default Buy
