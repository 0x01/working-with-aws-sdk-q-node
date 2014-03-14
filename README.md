# Usage

Checkout, then install dependencies.

    npm install
	npm install -g docco # if you don't have it already

You can run it, of course

    node index.js

Build documentation like this

    docco -l linear -c docco.css index.js

Open in a browser

    open docs/index.html # Mac
    xdg-open docs/index.html # Linux
