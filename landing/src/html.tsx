import React from "react"
import PropTypes from "prop-types"

export default function HTML(props) {
  return (
    <html {...props.htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        {/* <meta httpEquiv="x-ua-compatible" content="ie=edge" /> */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {props.headComponents}
      </head>
      <body {...props.bodyAttributes}>
        {props.preBodyComponents}
        <div
          key={`body`}
          id="___gatsby"
          dangerouslySetInnerHTML={{ __html: props.body }}
        />
        {props.postBodyComponents}

        <script
          dangerouslySetInnerHTML={{
            __html: `
   const script = document.createElement('script');
    script.src = 'https://metrics.cyb.ai/js/script.js';
    script.setAttribute('data-domain', location.host);
    script.defer = true;
    document.body.appendChild(script);

  `,
          }}
        />
      </body>
    </html>
  )
}
