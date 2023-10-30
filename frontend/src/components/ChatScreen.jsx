import { useEffect, useRef, useState } from "react";
import {
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { io } from "socket.io-client";
import Peer from "peerjs";
import { v4 as uuidv4 } from "uuid";

function ChatScreen() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [filters, setFilters] = useState("");
  const [matchedFilters, setMatchedFilters] = useState("");
  const [localPeerObj, setLocalPeerObj] = useState({
    peerId: "",
    socketId: "",
  });
  const [remotePeerObj, setRemotePeerObj] = useState({
    peerId: "",
    socketId: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFinding, setIsFinding] = useState(false);

  const socket = useRef(null);
  const myPeer = useRef(null);
  const dataConnection = useRef(null);
  const mediaConnection = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const chatContainerRef = useRef(null);

  const userId = uuidv4();
  const MEDIA_CONSTRAINTS = {
    video: {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 15, max: 30 },
      facingMode: "user",
    },
    audio: true,
  };

  let filtersSet = new Set();

  const getLocalUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        MEDIA_CONSTRAINTS
      );
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true;
      localVideoRef.current.onloadedmetadata = () => {
        localVideoRef.current.play();

        // Get the height of the element with ID "media-section"
        const mediaSection = document.getElementById("media-section");
        const chatSection = document.getElementById("chat-section");

        if (mediaSection && chatSection) {
          if (document.documentElement.clientHeight <= 768) {
            chatSection.style.height =
              document.documentElement.clientHeight -
              mediaSection.clientHeight +
              "px";
          } else {
            chatSection.style.height = mediaSection.clientHeight + "px";
          }
        }
      };
      return true;
    } catch (err) {
      return false;
    }
  };

  useEffect(() => {
    getLocalUserMedia();
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const createConnection = async () => {
    setLoading(true);

    if (!localVideoRef.current) {
      setError("Error accessing camera and microphone.");
      setLoading(false);
      return;
    }

    if (!socket.current) {
      // Connect to the signaling server using Socket.io.
      socket.current = io(process.env.REACT_APP_BACKEND_URL);
    }

    // Handle user connections.
    socket.current.on("remote-connected", (remotePeerId) => {
      console.log("Remote peer connected.", remotePeerId);
      setRemotePeerObj({ ...remotePeerObj, peerId: remotePeerId });
    });

    // Handle remote user disconnections.
    socket.current.on("remote-disconnected", () => {
      console.log("Remote user disconnect executed");
      leaveConnection(true);
    });

    socket.current.on("disconnect", () => {
      setLocalPeerObj({ ...localPeerObj, socketId: "" });
      socket.current = null;
      console.log("Socket.io disconnected.");
    });

    setLoading(false);
  };

  const initiateConnection = async () => {
    //  Initialize PeerJS for WebRTC.
    if (!myPeer.current) {
      myPeer.current = new Peer(userId, {
        host: process.env.REACT_APP_PEERJS_HOST,
        port: process.env.REACT_APP_PEERJS_PORT,
        path: "/peerjs",
        secure: true,
        debug: process.env.REACT_APP_PEERJS_DEBUG,
      });
    }

    myPeer.current.on("open", (peerId) => {
      setLocalPeerObj({ ...localPeerObj, peerId: peerId });
      console.log("Peer connection opened.");
      console.log("My peer connection id is: " + peerId);
      socket.current.emit("find-connection-request", peerId, [...filtersSet]);
      // socket.current.emit('remote-connect', peerId);
    });

    // Manage incoming data connections.
    myPeer.current.on("connection", (connection) => {
      console.log("New data connection: ", connection);

      connection.on("open", () => {
        console.log("Data connection opened.");
      });

      connection.on("data", (data) => {
        console.log("Received: ", data);
        setMessages((prevMessages) => [
          ...prevMessages,
          { text: data, mine: false },
        ]);
      });

      connection.on("close", () => {
        console.log("Data connection closed.");
      });
    });

    // Manage incoming media connections.
    myPeer.current.on("call", (call) => {
      mediaConnection.current = call;
      console.log("Incoming call.", call);
      call.answer(localVideoRef.current.srcObject);
      call.on("stream", (remoteStream) => {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.onloadedmetadata = () => {
          remoteVideoRef.current.play();
        };
      });

      call.on("close", () => {
        console.log("Media connection closed.");
      });

      call.on("error", (err) => {
        setError("Media connection error. Try again.");
        console.log(err);
      });
    });

    myPeer.current.on("close", () => {
      leaveConnection();
      console.log("Peer connection closing.");
      myPeer.current.destroy();
      setLocalPeerObj({ ...localPeerObj, peerId: "" });
      myPeer.current = null;
    });

    myPeer.current.on("error", (err) => {
      leaveConnection();
      setError("Connection error. Try again.");
      console.log(err);
    });
  };

  const joinDataConnection = (remotePeer) => {
    console.log("Joining Data Connection: ", remotePeer);

    dataConnection.current = myPeer.current.connect(remotePeer, {
      reliable: true,
    });
    console.log("Data connection initiated.");

    dataConnection.current.on("open", () => {
      console.log("Data connection is opened.");
    });
    dataConnection.current.on("error", (err) => {
      setError("Data connection error. Try again.");
      console.log(err);
    });
  };

  const callRemotePeer = (remotePeer) => {
    joinDataConnection(remotePeer);
    mediaConnection.current = myPeer.current.call(
      remotePeer,
      localVideoRef.current.srcObject
    );
    mediaConnection.current.on("stream", (remoteStream) => {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.onloadedmetadata = () => {
        remoteVideoRef.current.play();
      };
    });

    mediaConnection.current.on("error", (err) => {
      setError("Media connection error. Try again.");
      console.log(err);
    });

    mediaConnection.current.on("close", () => {
      console.log("Media connection closed.");
    });
  };

  const processFilters = async () => {
    if (filters.trim() !== "") {
      filtersSet = new Set(
        filters.split(",").map((string) => string.trim().toLowerCase())
      );
      // Incase coma separated empty values are passed
      filtersSet.delete("");
    } else {
      filtersSet = new Set();
    }
  };

  const findConnection = async () => {
    setLoading(true);
    setIsFinding(true);
    setError("");

    if (localVideoRef.current === null) {
      setError("No video stream found. Try again.");
      setLoading(false);
      return;
    }

    if (socket.current === null) {
      try {
        await createConnection();
      } catch (error) {
        console.log(error);
        setError("Error creating connection. Try again.");
        setLoading(false);
        return;
      }
    }

    await processFilters();

    console.log("Filters: ", filtersSet);

    if (!myPeer.current) {
      try {
        await initiateConnection();
      } catch (error) {
        console.log(error);
        setError("Error intiating connection. Try again.");
        setLoading(false);
        return;
      }
    } else {
      console.log("Peer reconnection.", localPeerObj);
      socket.current.emit("find-connection-request", localPeerObj.peerId, [
        ...filtersSet,
      ]);
    }

    socket.current.on(
      "find-connection-response",
      (remotePeer, isRemoteFirstInitiated, matchedFilters) => {
        setIsFinding(false);
        if (remotePeer) {
          if (remotePeer.peerId === localPeerObj.peerId) {
            setError("Wrong connection found. Try again.");
          } else {
            if (matchedFilters) {
              setMatchedFilters(matchedFilters.join(","));
            }
            console.log(
              "Remote peer found: ",
              remotePeer,
              isRemoteFirstInitiated
            );
            setRemotePeerObj({
              peerId: remotePeer.peerId,
              socketId: remotePeer.socketId,
            });
            if (isRemoteFirstInitiated) {
              joinDataConnection(remotePeer.peerId);
            } else {
              callRemotePeer(remotePeer.peerId);
            }
          }
        } else {
          setError("Connection not found. Try again.");
        }
      }
    );
    setLoading(false);
  };

  const leaveConnection = (isRemoteFirstLeave = false) => {
    setLoading(true);
    if (!isRemoteFirstLeave && remotePeerObj.socketId) {
      socket.current.emit("notify-remote-disconnect", remotePeerObj.socketId);
    }
    console.log("Leaving connection.");
    setMatchedFilters("");
    setMessages([]);

    if (dataConnection.current && dataConnection.current.open) {
      dataConnection.current.close();
    }
    if (mediaConnection.current && mediaConnection.current.open) {
      mediaConnection.current.close();
    }

    setRemotePeerObj({
      peerId: "",
      socketId: "",
    });
    setLoading(false);
    setError("");
  };

  const stopFindingConnection = () => {
    if (socket.current) {
      socket.current.emit("stop-find-connection");
    }
    setIsFinding(false);
    setLoading(false);
    setError("");
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    setError("");
    if (message.trim() === "" || !dataConnection.current) {
      setError("Message is empty or user not connected");
      return;
    }

    if (dataConnection.current.open) {
      dataConnection.current.send(message);
      setMessages((prevMessages) => [
        ...prevMessages,
        { text: message, mine: true },
      ]);
      setMessage("");
    } else {
      setError("Message not sent. Try again.");
    }
  };

  return (
    <div className="container mx-auto relative" data-theme="dark">
      {loading ? (
        <div className="fixed inset-x-1/3 z-10 bottom-0 mb-12 font-bold text-2xl">
          Loading....
        </div>
      ) : null}
      {error ? (
        <div className="fixed inset-x-1/3 z-10 bottom-0 mb-12 font-bold md:text-2xl w-1/2">
          {error}
        </div>
      ) : null}

      <div className="md:grid md:grid-cols-4 md:justify-items-stretch relative md:static">
        <div className="fixed z-10 top-0 inset-x-0 md:static md:z-auto md:top-auto md:inset-auto md:mt-2 md:col-span-2">
          <div className="md:grid" id="media-section">
            <div className=" bg-green-200 md:mt-2 rounded-box place-items-center remote-video">
              <video
                className="w-full h-full rounded-box md:h-[400px]"
                ref={remoteVideoRef}
              ></video>
            </div>
            <div className="absolute top-0 right-0 md:static md:top-auto md:right-auto md:bg-blue-200 md:mt-2 md:rounded-box place-items-center local-video">
              <video
                className="w-16 h-20 sm:w-24 sm:h-32 md:w-full md:h-[400px] rounded-box"
                ref={localVideoRef}
              ></video>
            </div>
          </div>
        </div>

        <div
          className="fixed bottom-0 inset-x-0 md:bottom-auto md:inset-auto md:relative md:col-span-2 md:m-4 bg-base-300 rounded-box flex flex-col-reverse"
          id="chat-section"
        >
          <div className="communication-controls flex flex-row gap-1 m-2 md:gap-2 md:m-3">
            {remotePeerObj.peerId ? (
              <>
                <input
                  className="input input-sm md:input-md w-full"
                  type="text"
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button
                  className="btn btn-sm md:btn-md btn-success"
                  onClick={handleSendMessage}
                  onTouchEnd={handleSendMessage}
                >
                  Send
                </button>
                <button
                  className="btn btn-sm md:btn-md btn-error"
                  onClick={() => leaveConnection(false)}
                >
                  Leave
                </button>
              </>
            ) : (
              <>
                <input
                  className="input input-sm md:input-md w-full"
                  type="text"
                  placeholder="Enter topics... ex. math, physics, chemistry, etc."
                  value={filters}
                  onChange={(e) => setFilters(e.target.value)}
                />
                {isFinding ? (
                  <button
                    className="btn btn-sm md:btn-md btn-error"
                    onClick={stopFindingConnection}
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                ) : (
                  <button
                    className="btn btn-sm md:btn-md btn-success"
                    onClick={findConnection}
                  >
                    <MagnifyingGlassIcon className="w-6 h-6" />
                  </button>
                )}
                <button
                  className="btn btn-sm md:btn-md btn-info"
                  onClick={() =>
                    document.getElementById("select-filters-modal").showModal()
                  }
                >
                  <AdjustmentsHorizontalIcon className="w-6 h-6" />
                </button>
              </>
            )}
            <dialog id="select-filters-modal" className="modal">
              <div className="modal-box">
                <form method="dialog">
                  {/* if there is a button in form, it will close the modal */}
                  <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
                    ✕
                  </button>
                </form>
                <h3 className="font-bold text-lg">Select Filters</h3>
                <p className="py-4">Coming soon...</p>
              </div>
              <form method="dialog" className="modal-backdrop">
                <button>close</button>
              </form>
            </dialog>
          </div>
          <div
            className="messages-box md:mx-2 md:mt-4 mt-2 overflow-y-auto scroll-smooth"
            ref={chatContainerRef}
          >
            {matchedFilters ? (
              <div className="grid justify-items-center text-md text-base-content p-2">
                <p className="text-lg font-bold">Matched Topics</p>
                <p>{matchedFilters}</p>
              </div>
            ) : null}
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`chat ${msg.mine ? "chat-end" : "chat-start"}`}
              >
                <div
                  className={`chat-bubble ${
                    msg.mine ? "bg-blue-200" : "bg-green-200"
                  } text-sm md:text-base text-black pt-3 px-3 md:pt-2 md:px-4`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatScreen;
