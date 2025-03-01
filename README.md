# React Template with Vite and Deno

This is a GitHub template project to set up a [React](https://react.dev/) app
with TypeScript running on [Deno](https://deno.com). It uses
[Vite](https://vite.dev) as the dev server and an [oak](https://jsr.io/@oak/oak)
http server on the backend to serve the built project.

## Features

- React with TypeScript on the frontend
- Vite for the development server
- Deno for server-side JavaScript/TypeScript
- Oak framework for building web applications
- Static file serving
- Router setup

## Getting Started

### Prerequisites

To run this app, you will need to have [Deno](https://docs.deno.com/runtime/)
installed.

### Installation

1. Create a new repository using this template. From the repository page, click
   the "Use this template" button in the top right hand of the page:

<img src="https://docs.github.com/assets/cb-76823/images/help/repository/use-this-template-button.png" alt="Use this template button" width="400">

2. Use the Owner dropdown menu to select the account you want to own the
   repository and set the repository name and visibility.

3. Clone the repository created to your local machine.

```sh
git clone https://github.com/Reksa97/xrpl-distribution-tracker.git
cd xrpl-distribution-tracker
```

## Install the dependencies

To install the dependencies for the frontend and backend, run the following
command:

```sh
deno install
```

## Run the dev server with vite

The app uses a Vite dev server to run in development mode. To start the dev
server, run the following command:

```sh
deno run dev
```

## Build the app

To build the app for production, run the following command:

```sh
deno run build
```

## Run the backend server

The backend server uses Deno and the Oak framework to serve the built React app.
To start the backend server, run the following command:

```sh
deno run serve
```

## Running Tests

To run the tests, use the following command:

```sh
deno test -A
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
