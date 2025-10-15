import { useState } from "react";

const details = {
	Bitcoin: {
		BTC: "https://pay.cryptomus.com/wallet/5ea601e6-f901-487d-b2c1-02edce2476cb",
	},
	Ethereum: {
		ETH: "https://pay.cryptomus.com/wallet/2833da3a-0cee-43f3-a373-28f49f6303bd",
		BSC: "https://pay.cryptomus.com/wallet/a51204d4-a207-4c77-95d3-fa2a2821851e",
		Arbitrum: "https://pay.cryptomus.com/wallet/4bce6752-e621-4a56-a3b8-d3aff1afb241",
	},
	USDC: {
		POL: "https://pay.cryptomus.com/wallet/7bea6307-e208-41dd-aa82-06eda7d2bdf8",
		ETH: "https://pay.cryptomus.com/wallet/bf43f539-fb63-4284-9012-aeb41ece9e74",
		Arbitrum: "https://pay.cryptomus.com/wallet/55c65ef3-8236-4a47-905a-d281d1541020",
		BSC: "https://pay.cryptomus.com/wallet/93ded2a7-6001-4456-9e93-304272bf679f",
	},
};

export function Crypto({ closeCrypto }: { closeCrypto: () => void }) {
	const [selectedCurrency, setSelectedCurrency] = useState(Object.keys(details)[0] as any);
	const [selectedNetwork, setNetwork] = useState(Object.keys(details[selectedCurrency])[0] as any);

	const currentDetails = details[selectedCurrency];
	const networks = Object.keys(currentDetails);
	const link = currentDetails[selectedNetwork] || "";

	console.log(selectedCurrency, selectedNetwork, currentDetails, link);

	return (
		<div
			className="absolute inset-0 z-30 bg-black/20 flex items-center justify-center backdrop-blur-sm"
			role="presentation"
			onClick={closeCrypto}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="donation-modal-title"
				className="bg-white/95 text-neutral-900 max-w-xl w-full rounded-lg shadow-xl overflow-y-auto h-screen flex-1 flex flex-col"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-start justify-between gap-4 p-6 pb-0">
					<div>
						<h2 id="donation-modal-title" className="text-lg font-semibold">
							Crypto{" "}
						</h2>
					</div>
					<button
						type="button"
						onClick={closeCrypto}
						className="text-neutral-500 hover:text-neutral-700 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
						aria-label="Close donation dialog"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" className="size-4" aria-hidden="true">
							<path
								fill="currentColor"
								d="M310.6 361.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L160 301.3 54.6 406.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L114.7 256 9.4 150.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 210.7l105.4-105.4c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3L205.3 256l105.3 105.4z"
							/>
						</svg>
					</button>
				</div>

				<div className="flex space-x-1 bg-neutral-100 p-1 rounded-lg px-6">
					{Object.keys(details).map((currency) => (
						<button
							type="button"
							onClick={() => {
								setSelectedCurrency(currency as any);

								const networks = Object.keys(details[currency as keyof typeof details]);
								if (!networks.includes(selectedNetwork)) {
									setNetwork(networks[0] as any);
								}
							}}
							className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
								selectedCurrency === currency
									? "bg-white text-neutral-900 shadow-sm"
									: "text-neutral-600 hover:text-neutral-900"
							}`}
						>
							{currency}
						</button>
					))}
				</div>
				{networks.length > 1 && (
					<div className="px-6 p-1">
						<p className="text-black/60 font-semibold text-xs mb-1">Network</p>
						<div className="flex space-x-1 bg-neutral-100 rounded-lg">
							{networks.map((network) => (
								<button
									type="button"
									onClick={() => {
										setNetwork(network as any);
									}}
									className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
										selectedNetwork === network
											? "bg-white text-neutral-900 shadow-sm"
											: "text-neutral-600 hover:text-neutral-900"
									}`}
								>
									{network}
								</button>
							))}
						</div>
					</div>
				)}

				{link && <iframe className="flex-1" src={link} />}
			</div>
		</div>
	);
}
