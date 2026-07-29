import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";




const generateAccessAndRefreshToken = async (userId) => {

    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({
            validateBeforeSave: false
        })

        return { accessToken, refreshToken }
    } catch (error) {
        throw new ApiError(500, "soemthing went wrong")
    }
}


const registerUser = asyncHandler(async (req, res) => {
    // get user details from frontend
    // validation
    // check if user already exists :username and email
    //check for images check for avatar
    //upload to cloudinary, checks got or not 
    // create obj of user and creation call entry in db 
    //remove pass and refresh token from resposne 
    //checks for user creation and return res


    const { fullName, email, username, password } = req.body || {}
    console.log("email:", email)

    if (
        [fullName, email, username, password].some((field) =>

            field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required")
    }
    const existedUser = await User.findOne({
        $or: [{ userName: username }, { email }]
    })
    if (existedUser) {
        throw new ApiError(409, "User already exsits")
    }

    const avatarLocalPath = req.files?.avatar?.[0]?.path
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;


    if (!avatarLocalPath) {
        throw new ApiError(400, "avatar file required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(400, "Avatar is required filed")
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        userName: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if (!createdUser) {
        throw new ApiError(500, "something wnet wrong while uplading in server")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "user registered successfully")
    )

})

const loginUser = asyncHandler(async (req, res) => {
    // req body -> data
    //username or email
    //find the user
    //password check
    //accedd and resfresh token genreate 
    //sedn it thorugh cookie

    const { email, username, password } = req.body || {}
    if (!(username || email)) {
        throw new ApiError(400, "username or email is required")
    }

    const user = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (!user) {
        throw new ApiError(404, "User does not exists")
    }


    const isPassWordValid = await user.isPassWordCorrect(password)

    if (!isPassWordValid) {
        throw new ApiError(404, "invalid user credentials")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id)


    const loggedInUser = await User.findById(user._id).
        select("-password -refreshToken")


    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200, {
                user: loggedInUser, accessToken, refreshToken
            },
                "User logged in successfully"
            )
        )

})

const logOutuser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id, {
        $set: {
            refreshToken: undefined
        }
    }, {
        new: true
    }

    )
    const options = {
        httpOnly: true,
        secure: true
    }
    return res.status(200).clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
            new ApiResponse(200, {}, "user logout ")
        )
})

const refreshAccessToken = asyncHandler(async (req, res) => {

    const incomingRefreshToken = req.cookie.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request")
    }
    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )

        const user = await user.findById(decodedToken?._id)
        if (!user) {
            throw new ApiError(401, "invaild refresh token request")
        }


        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "token already used")
        }

        const options = {
            httpOnly: true,
            secure: true
        }

        const { accessToken, newrefreshToken } = await generateAccessAndRefreshToken(user._id)

        return res.status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newrefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, refreshToken: newrefreshToken },
                    "Access token refreshed"
                )
            )
    } catch (error) {
        throw new ApiError(401, error?.message ||
            "Invalid refresh token")
    }
})


const changeCurrentPassword = asyncHandler(async (res, req) => {
    const { oldPassword, newPassword } = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPassWordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invaild password")
    }
    user.password = newPassword

    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "PassWord changed scuccessfull"))
})

const getCurrentUser = asyncHandler(async (res, req) => {
    return res.status(200).json(
        new ApiResponse(200, req.user, "current usre fetcehed successfull"))
})


const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body
    if (!(fullName || email)) {
        throw new ApiError(400, "All fields are required")
    }
    const user = User.findByIdAndUpdate(
        req.user?._id, {
        $set: {
            fullName,
            email
        }
    },
        { new: true }
    ).select("-password")

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Account details updated successfully"))
})

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url) {
        throw new ApiError(400, "Error while uploading on avartat")
    }
    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        }
        , {
            new: true
        }


    ).select("-password")
    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "avatar image updated")
        )
})

const updateUserCoverImg = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path
    if (!coverImageLocalPath) {
        throw new ApiError(400, "cover Img file is missing")
    }
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!coverImage.url) {
        throw new ApiError(400, "Error while uploading on imge")
    }
    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        }
        , {
            new: true
        }


    ).select("-password")
    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "cover image updated")
        )
})



const getUserChannelProfile = asyncHandler(async () => {
    const { username } = req.params

    if (!username?.trim()) {
        throw new ApiError(400, "username is missing");
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        }, {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }

        }, {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        }, {

            $addFields: {

                subscribersCount: {
                    //size to count 
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {
                            $in: [req.user?._id, "$subscriber.subscibers"]
                        },
                        then: true,
                        else: false
                    }
                }
            }
        }, {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }

        }
    ])


    if (!channel?.length) {
        throw new ApiError(404, "channel does not exists")
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, channel[0], "User channel fetched successfully")
        )
})


const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate(
        [

            {

                $match: {
                    _id: new mongoose.Types.ObjectId(req.user._id)
                }
            },

            {
                $lookup: {
                    from: "videos",
                    localField: "watchHistory",
                    
                    foreignField: "_id",
                    as: "watchHistory",
                    pipeline: [
                        {
                            $lookup: {
                                from: "users",
                                localField: "owner",
                                foreignField: "_id",
                                as: "owner",
                                pipeline: [
                                    {
                                        $project: {
                                            fullName: 1,
                                            username: 1,
                                            avatar: 1
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $addFields: {
                                owner: {
                                    $first: "$owner"
                                }
                            }
                        }
                    ]
                }
            }
        ]
    )


    return res
        .status(200)
        .json(
            new ApiResponse(
                200, user[0].watchHistory, "watch history fetched sucessfully"
            )
        )
})

export { updateUserCoverImg, updateUserAvatar, updateAccountDetails, registerUser, changeCurrentPassword, loginUser, logOutuser, refreshAccessToken, getCurrentUser, getUserChannelProfile, getWatchHistory }