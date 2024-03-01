const express = require("express");
const http = require("http");
const { ExpressPeerServer } = require("peer");
const { Server } = require("socket.io");
const cors = require("cors");
const { Mutex } = require("async-mutex");

const dotenv = require("dotenv");
dotenv.config();

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "https://localhost:3000",
  "https://studyhomies.com",
  "https://www.studyhomies.com",
  "https://studyhomies.yogeshsirsat.online",
];
app.use(
  cors({
    origin: allowedOrigins,
  })
);

// (IMP)To use websockets in chrome, http needs to be secured(https)
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
  },
});

const peerServer = ExpressPeerServer(server, {
  proxied: true,
  debug: true,
  path: "/peerjs",
});

app.use(peerServer);

app.get("/", (req, res) => {
  res.send("StudyHomies Server is running.");
});

const filterPeersMutex = new Mutex();
const noFilterPeersMutex = new Mutex();
const waitingFilterAppliedPeers = new Set();
const waitingNoFilterPeers = new Set();

io.on("connection", (socket) => {
  console.log("A user connected");
  const currPeerObj = {
    peerId: null,
    socketId: socket.id,
  };

  socket.on("find-connection-request", async (peerId, filters) => {
    currPeerObj.peerId = peerId;
    console.log("connection request", peerId, socket.id);
    console.log("filters: ", typeof filters, filters);
    if (filters.length) {
      if (waitingFilterAppliedPeers.has(currPeerObj)) {
        return;
      }
      const release = await filterPeersMutex.acquire();
      try {
        console.log(
          "current size of filter queue",
          waitingFilterAppliedPeers.size
        );
        currPeerObj.filters = new Set(filters);
        matchFilterAppliedPeers(currPeerObj);
      } catch (err) {
        console.log("Error insde filter queue", err);
      } finally {
        release();
      }
    } else {
      if (waitingNoFilterPeers.has(currPeerObj)) {
        return;
      }
      // Remove any old filters saved in local object
      delete currPeerObj.filters;
      const release = await noFilterPeersMutex.acquire();
      try {
        console.log(
          "current size of no filter queue",
          waitingNoFilterPeers.size
        );
        if (waitingNoFilterPeers.size) {
          const remotePeerObj = waitingNoFilterPeers.values().next().value;
          waitingNoFilterPeers.delete(remotePeerObj);
          connectPeers(currPeerObj, remotePeerObj, null);
        } else {
          waitingNoFilterPeers.add(currPeerObj);
        }
        console.log(
          "Size of no fitler queue ater operation",
          waitingNoFilterPeers.size
        );
      } catch (err) {
        console.log("Error insde no filter queue", err);
      } finally {
        release();
      }
    }
  });

  const rmCurrPeerObjFromWaiting = () => {
    console.log("isFilters: ", "filters" in currPeerObj ? true : false);
    if ("filters" in currPeerObj) {
      delete currPeerObj.filters;
      waitingFilterAppliedPeers.delete(currPeerObj);
      console.log(
        "Size of filter queue after rm operation",
        waitingFilterAppliedPeers.size
      );
    } else {
      waitingNoFilterPeers.delete(currPeerObj);
      console.log(
        "Size of no filter queue after rm operation",
        waitingNoFilterPeers.size
      );
    }
  };

  socket.on("stop-find-connection", () => {
    console.log("stoping find connection, ");
    rmCurrPeerObjFromWaiting();
  });

  socket.on("notify-remote-disconnect", (remoteSocketId) => {
    console.log("A remote user disconnected", remoteSocketId);
    io.to(remoteSocketId).emit("remote-disconnected");
  });

  socket.on("disconnect", () => {
    rmCurrPeerObjFromWaiting();
    console.log("A user disconnected");
  });

  socket.on("connect_error", (err) => {
    rmCurrPeerObjFromWaiting();
    console.log(`connect_error due to ${err.message}`);
  });
});

const connectPeers = async (currPeerObj, remotePeerObj, matchedFilters) => {
  console.log("current peer object: ", currPeerObj);
  console.log("remote peer object: ", remotePeerObj);
  io.to(remotePeerObj.socketId).emit(
    "find-connection-response",
    currPeerObj,
    false,
    matchedFilters
  );
  io.to(currPeerObj.socketId).emit(
    "find-connection-response",
    remotePeerObj,
    true,
    matchedFilters
  );
};

const findMatch = async (currPeerObj) => {
  let maxMatchedFilters = [];
  let matchedPeerObj = null;
  waitingFilterAppliedPeers.forEach((remotePeerObj) => {
    const currMatchedFilters = [...currPeerObj.filters].filter((str) =>
      remotePeerObj.filters.has(str)
    );

    if (maxMatchedFilters.length < currMatchedFilters.length) {
      maxMatchedFilters = currMatchedFilters;
      matchedPeerObj = remotePeerObj;
    }
  });
  return { matchedPeerObj, maxMatchedFilters };
};

const matchFilterAppliedPeers = async (currPeerObj) => {
  const match = await findMatch(currPeerObj);
  if (match.matchedPeerObj) {
    // Remove matched peer from waiting, so no other peer can connect to it
    // leading two connections for matched peer.
    waitingFilterAppliedPeers.delete(match.matchedPeerObj);
    console.log(
      "Matched peer removed from waiting: ",
      waitingFilterAppliedPeers.has(match.matchedPeerObj)
    );
    await connectPeers(
      currPeerObj,
      match.matchedPeerObj,
      match.maxMatchedFilters
    );
  } else {
    waitingFilterAppliedPeers.add(currPeerObj);
  }
  console.log(
    "Size of filter queue after operation",
    waitingFilterAppliedPeers.size
  );
};

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server is running on port http://localhost:${PORT}`);
});
